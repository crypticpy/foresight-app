"""Repair source<->card links mislinked by the signal-agent batch-local index bug.

THE BUG (fixed forward in PR #255): the signal agent numbered sources
batch-locally per pillar, but execution resolved those indices against the
run-global source list — so a CH card got the run's Nth global source (often a
different pillar's article) instead of the source the CH agent actually saw.
Result: ~360 cards in multi-pillar runs show thematically-wrong sources
(e.g. an animal-shelter card surfacing climate-resilience articles).

THE REPAIR (this script): the original exact linkage is not deterministically
recoverable (batch order was ephemeral), but the *content* is intact. For each
run we re-match the run's cards to the run's own source pool by embedding
similarity (within pillar where pillar is known), then rewrite the links:

  - candidate pool, per run:
      tier-1  run has a `discovered_sources` audit pool  -> use it (the
              authoritative record of everything the run found, incl. sources
              that were never persisted to `sources`). Embedded fresh (3-small).
      tier-2  run predates the audit table -> use the run's existing distinct
              `sources` rows (their stored 3-small embeddings).
  - assignment (differs by tier):
      tier-1 (card-centric): each card takes its top-K same-pillar (or
              unknown-pillar) candidates with cosine >= FLOOR, capped at
              MAX_PER_CARD. Sharing is allowed — one discovered_source may
              support several sibling cards. Most of the audit pool was triaged
              out, so a card with nothing >= FLOOR is left honestly empty
              (reported), never force-filled.
      tier-2 (source-centric): every existing `sources` row is re-homed to its
              single best-matching card (argmax, requiring best cosine >= 0),
              uncapped, so no fetched source is dropped. A card that is no
              source's argmax ends up empty — which, for these audit-less runs,
              means the run held no source that matched it best (often a
              near-duplicate sibling that lost every source to its twin, or a
              card whose run simply lacked an on-theme source). Honest-empty
              beats fabricating a link to a baseline-similar but off-theme
              article (all gov-tech text shares a ~0.45-0.55 cosine floor).
    Neither tier guarantees a non-empty result: an empty Sources panel is the
    correct, honest outcome when the run's recoverable pool has no on-theme
    match.
  - write (non-destructive): repoint existing `sources` rows in place to their
    correct card (one row per (card,url), respecting UNIQUE(card_id,url)),
    INSERT only genuinely-missing sources, NULL only true surplus rows
    (never DELETE — card_timeline.triggered_by_source_id has no ON DELETE rule).
    `signal_sources` is rebuilt per card (it's a leaf junction). card.source_count
    is refreshed.

Idempotent: a second --apply pass re-derives the same assignment, finds the
rows already correct, and is a near no-op.

Usage:
    python -m scripts.repair_signal_source_links              # dry-run, all repairable runs
    python -m scripts.repair_signal_source_links --run <id>   # dry-run, one run
    python -m scripts.repair_signal_source_links --run <id> --apply
    python -m scripts.repair_signal_source_links --apply      # apply to all repairable runs

Backups (current sources.card_id + signal_sources for each touched run) are
written under scripts/repair_backups/ before any mutation.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
from collections import defaultdict
from datetime import datetime, timezone

os.environ.setdefault("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=False)

from supabase import create_client  # noqa: E402
from app.openai_provider import (  # noqa: E402
    azure_openai_async_embedding_client,
    get_embedding_deployment,
)

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# --- tuning ---------------------------------------------------------------
# FLOOR is a HARD relevance cut, not a soft preference. A card with no in-run
# source at/above FLOOR is left with ZERO sources (honest-empty) rather than
# force-filled — fabricating a wrong link (e.g. an animal card citing climate,
# or a foster-care card citing a Hacker News post) is a worse bug than the one
# we're repairing. There is deliberately NO non-starvation minimum.
FLOOR = 0.45            # min cosine for a real, on-theme match
MAX_PER_CARD = 8        # cap per card
EMBED_CONCURRENCY = 8
_INPUT_CAP = 8000
_FULLTEXT_CAP = 100_000

_BACKUP_DIR = os.path.join(os.path.dirname(__file__), "repair_backups")


# --- helpers --------------------------------------------------------------
def _vec(e):
    if isinstance(e, str):
        e = json.loads(e)
    return e or []


def _cos(a, b):
    if not a or not b:
        return -1.0
    s = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return s / (na * nb) if na and nb else -1.0


def _page(table, select, eq=None, in_=None):
    out, cur = [], 0
    while True:
        q = sb.table(table).select(select)
        if eq:
            for k, v in eq.items():
                q = q.eq(k, v)
        if in_:
            q = q.in_(in_[0], in_[1])
        rows = q.range(cur, cur + 999).execute().data
        if not rows:
            break
        out += rows
        cur += len(rows)
        if len(rows) < 1000:
            break
    return out


async def _embed_texts(texts):
    """Embed a list of texts (3-small), preserving order; None for too-short."""
    sem = asyncio.Semaphore(EMBED_CONCURRENCY)

    async def one(t):
        if not t or len(t) < 10:
            return None
        async with sem:
            r = await azure_openai_async_embedding_client.embeddings.create(
                model=get_embedding_deployment(), input=t[:_INPUT_CAP], timeout=60
            )
        return r.data[0].embedding

    return await asyncio.gather(*[one(t) for t in texts])


# --- candidate construction ----------------------------------------------
class Candidate:
    __slots__ = ("url", "title", "summary", "full_text", "pillar", "emb")

    def __init__(self, url, title, summary, full_text, pillar, emb):
        self.url = url
        self.title = title
        self.summary = summary
        self.full_text = full_text
        self.pillar = pillar
        self.emb = emb


async def _build_candidates(run, existing_sources):
    """Return (tier, [Candidate]). Prefer the discovered_sources audit pool."""
    ds = _page(
        "discovered_sources",
        "title,url,analysis_summary,content_snippet,full_content,"
        "analysis_pillars,triage_primary_pillar",
        eq={"discovery_run_id": run},
    )
    if ds:
        # tier-1: embed discovered_sources fresh
        texts, metas = [], []
        seen = set()
        for d in ds:
            url = d.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            title = (d.get("title") or "").strip()
            summary = (d.get("analysis_summary") or d.get("content_snippet") or "").strip()
            full_text = (d.get("full_content") or d.get("content_snippet") or "")[:_FULLTEXT_CAP]
            ap = d.get("analysis_pillars") or []
            pillar = ap[0] if ap else d.get("triage_primary_pillar")
            texts.append(f"{title} {summary}".strip())
            metas.append((url, title, summary, full_text, pillar))
        embs = await _embed_texts(texts)
        cands = [
            Candidate(m[0], m[1], m[2], m[3], m[4], e)
            for m, e in zip(metas, embs)
            if e
        ]
        return "tier1-discovered_sources", cands

    # tier-2: dedup existing run sources by url, reuse stored embeddings
    seen, cands = set(), []
    to_embed_idx, to_embed_txt = [], []
    for s in existing_sources:
        url = s.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        emb = _vec(s.get("embedding"))
        c = Candidate(
            url,
            (s.get("title") or "").strip(),
            (s.get("ai_summary") or "").strip(),
            (s.get("full_text") or "")[:_FULLTEXT_CAP],
            None,  # sources carry no pillar
            emb if emb else None,
        )
        cands.append(c)
        if not emb:
            to_embed_idx.append(len(cands) - 1)
            to_embed_txt.append(f"{c.title} {c.summary}".strip())
    if to_embed_txt:
        fresh = await _embed_texts(to_embed_txt)
        for i, e in zip(to_embed_idx, fresh):
            cands[i].emb = e
    cands = [c for c in cands if c.emb]
    return "tier2-existing_sources", cands


# --- assignment -----------------------------------------------------------
def _assign_card_centric(cards, cands):
    """TIER-1. card_id -> top-K best candidates (>= FLOOR), within pillar.

    The pool is the run's full ``discovered_sources`` audit record, most of
    which was triaged out and should NOT be linked. So we pick each card's K
    best on-theme sources and leave the rest unlinked. A card with nothing
    >= FLOOR stays empty (reported), never force-filled.
    """
    out = {}
    for c in cards:
        cv = _vec(c["embedding"])
        scored = []
        for cand in cands:
            if cand.pillar and c["pillar_id"] and cand.pillar != c["pillar_id"]:
                continue  # pillar-known candidate from a different pillar
            scored.append((cand, _cos(cv, cand.emb)))
        scored.sort(key=lambda x: -x[1])
        chosen = [(cand, sc) for cand, sc in scored if sc >= FLOOR][:MAX_PER_CARD]
        out[c["id"]] = [(cand, max(0.0, min(1.0, sc))) for cand, sc in chosen]
    return out


def _assign_source_centric(cards, cands):
    """TIER-2. Re-home each existing source to its single best-matching card.

    Old runs predate the ``discovered_sources`` audit table, so the only pool
    is the run's already-persisted ``sources`` rows — every one was fetched
    *for this run* and belongs on *some* card; the bug only scrambled which.
    A card-centric top-K would orphan most of them (these runs carry ~35
    sources/card). Instead assign each source to its argmax card so nothing is
    lost and every source lands on its correct card. No MAX cap; no FLOOR
    beyond dropping the pathological anti-correlated case (best cosine < 0).
    """
    out = {c["id"]: [] for c in cards}
    cvecs = [(c["id"], _vec(c["embedding"])) for c in cards]
    for cand in cands:
        best_id, best_sc = None, 0.0  # require best cosine >= 0 to keep
        for cid, cv in cvecs:
            sc = _cos(cv, cand.emb)
            if sc > best_sc:
                best_sc, best_id = sc, cid
        if best_id is not None:
            out[best_id].append((cand, max(0.0, min(1.0, best_sc))))
    for cid in out:
        out[cid].sort(key=lambda x: -x[1])
    return out


# --- write ----------------------------------------------------------------
def _backup(run, run_card_ids, existing_sources):
    os.makedirs(_BACKUP_DIR, exist_ok=True)
    path = os.path.join(_BACKUP_DIR, f"{run}.json")
    # Preserve the FIRST (pre-repair) snapshot — a re-apply must not overwrite
    # it with already-repaired state, or the original audit trail is lost.
    if os.path.exists(path):
        return path
    ss = []
    for i in range(0, len(run_card_ids), 50):
        ss += sb.table("signal_sources").select("*").in_(
            "card_id", run_card_ids[i : i + 50]
        ).execute().data
    with open(path, "w") as f:
        json.dump(
            {
                "run": run,
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "sources": [
                    {"id": s["id"], "card_id": s["card_id"], "url": s.get("url")}
                    for s in existing_sources
                ],
                "signal_sources": ss,
            },
            f,
            indent=2,
        )
    return path


def _apply_run(run, assignment, existing_sources):
    """Repoint/insert/null sources rows + rebuild signal_sources. Returns stats."""
    # existing rows grouped by url (only run-card rows are candidates for reuse)
    by_url = defaultdict(list)
    for s in existing_sources:
        by_url[s.get("url")].append(s)
    used_row_ids = set()
    # (card_id, url) -> final source row id
    final_link = {}
    inserts = 0
    repoints = 0

    # desired (card,url) with best score
    desired = {}  # (card_id, url) -> (candidate, score)
    for card_id, lst in assignment.items():
        for cand, sc in lst:
            key = (card_id, cand.url)
            if key not in desired or sc > desired[key][1]:
                desired[key] = (cand, sc)

    # Pass 1: satisfy desired pairs by repointing an existing row with same url
    # (prefer a row already on the right card), else insert.
    # Order: group by url so we hand out that url's rows one-per-card.
    desired_by_url = defaultdict(list)
    for (card_id, url), (cand, sc) in desired.items():
        desired_by_url[url].append((card_id, cand, sc))

    for url, wants in desired_by_url.items():
        rows = list(by_url.get(url, []))
        # prefer to keep rows already on a wanted card
        wanted_cards = {w[0] for w in wants}
        rows.sort(key=lambda r: 0 if r["card_id"] in wanted_cards else 1)
        ri = 0
        for card_id, cand, sc in wants:
            # is there already a row at exactly (card_id, url)? (no-op — keep it)
            exact = next(
                (r for r in rows if r["card_id"] == card_id and r["id"] not in used_row_ids),
                None,
            )
            if exact:
                used_row_ids.add(exact["id"])
                final_link[(card_id, url)] = exact["id"]
                continue
            # reuse a free row with this url (repoint to card_id)
            free = None
            while ri < len(rows):
                cand_row = rows[ri]
                ri += 1
                if cand_row["id"] in used_row_ids:
                    continue
                free = cand_row
                break
            if free is not None:
                try:
                    sb.table("sources").update({"card_id": card_id}).eq(
                        "id", free["id"]
                    ).execute()
                    used_row_ids.add(free["id"])
                    final_link[(card_id, url)] = free["id"]
                    repoints += 1
                    continue
                except Exception as e:
                    # Unique collision etc. -> fall through to insert. Surface it
                    # so a systematic failure can't masquerade as a clean run.
                    print(
                        f"WARN: repoint of source {free['id']} -> card {card_id} "
                        f"failed, inserting fresh row instead: {e}",
                        flush=True,
                    )
            # Insert a fresh row. NOTE: production `sources` has no enforced
            # UNIQUE(card_id, url) (migration 001 declared it but duplicates
            # exist), so we can't upsert-on-conflict. Idempotency instead comes
            # from existing-row reuse above: rows inserted on a first --apply
            # belong to run cards, so a second pass finds them via ``by_url``
            # and repoints rather than re-inserting. relevance_score is an
            # integer column that's entirely NULL on existing rows — leave it.
            row = {
                "card_id": card_id,
                "url": cand.url,
                "title": cand.title or "Untitled",
                "ai_summary": cand.summary or None,
                "full_text": cand.full_text or None,
                "embedding": cand.emb,
            }
            ins = sb.table("sources").insert(row).execute().data
            if ins:
                final_link[(card_id, url)] = ins[0]["id"]
                inserts += 1
            else:
                # Success response with no rows: the link wasn't established, so
                # it's intentionally absent from final_link (Pass 3 skips it,
                # Pass 4 counts only real rows). Surface it rather than hiding it.
                print(
                    f"WARN: source insert for card {card_id} url {cand.url!r} "
                    f"returned no rows; link skipped",
                    flush=True,
                )

    # Pass 2: orphan surplus rows (run-card rows never reused)
    orphaned = 0
    for s in existing_sources:
        if s["id"] not in used_row_ids:
            sb.table("sources").update({"card_id": None}).eq("id", s["id"]).execute()
            orphaned += 1

    # Pass 3: rebuild signal_sources for the run's cards
    run_card_ids = list(assignment.keys())
    for i in range(0, len(run_card_ids), 50):
        sb.table("signal_sources").delete().in_(
            "card_id", run_card_ids[i : i + 50]
        ).execute()
    junctions = 0
    junction_failures = 0
    reasoning = "Relinked by content-similarity repair (signal-agent source-index scramble, PR #255)."
    # Rows were just deleted, so plain insert can't conflict. Batch the insert.
    rows = []
    for card_id, lst in assignment.items():
        for cand, sc in lst:
            sid = final_link.get((card_id, cand.url))
            if not sid:
                continue
            rows.append(
                {
                    "card_id": card_id,
                    "source_id": sid,
                    "relationship_type": "primary",
                    "confidence": round(float(sc), 2),
                    "agent_reasoning": reasoning,
                    "created_by": "link_repair",
                }
            )
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        try:
            sb.table("signal_sources").insert(chunk).execute()
            junctions += len(chunk)
        except Exception:
            # Fall back to per-row so one bad row can't drop the whole chunk.
            for r in chunk:
                try:
                    sb.table("signal_sources").insert(r).execute()
                    junctions += 1
                except Exception as e:
                    junction_failures += 1
                    print(
                        f"WARN: signal_sources insert failed for card "
                        f"{r['card_id']} source {r['source_id']}: {e}",
                        flush=True,
                    )

    # Pass 4: refresh card.source_count from the ACTUAL linked source rows
    # (ground truth = count of sources.card_id, matching backfill_source_count.py),
    # not the assignment size. A repoint that fell through or an insert that
    # returned no rows leaves a card with fewer real rows than it was assigned,
    # so len(lst) would overcount and re-create the very drift the backfill fixes.
    actual_counts = {cid: 0 for cid in assignment}
    for i in range(0, len(run_card_ids), 50):
        linked = (
            sb.table("sources")
            .select("card_id")
            .in_("card_id", run_card_ids[i : i + 50])
            .execute()
            .data
        )
        for r in linked:
            cid = r.get("card_id")
            if cid in actual_counts:
                actual_counts[cid] += 1
    for card_id, count in actual_counts.items():
        sb.table("cards").update({"source_count": count}).eq(
            "id", card_id
        ).execute()

    return {
        "repoints": repoints,
        "inserts": inserts,
        "orphaned": orphaned,
        "junctions": junctions,
        "junction_failures": junction_failures,
    }


# --- per-run driver -------------------------------------------------------
async def process_run(run, apply, focus_titles=None):
    cards = _page(
        "cards", "id,name,pillar_id,embedding", eq={"discovery_run_id": run}
    )
    cards = [c for c in cards if _vec(c["embedding"])]
    if not cards:
        return None
    card_ids = [c["id"] for c in cards]
    existing = []
    for i in range(0, len(card_ids), 50):
        existing += sb.table("sources").select(
            "id,card_id,url,title,ai_summary,full_text,embedding"
        ).in_("card_id", card_ids[i : i + 50]).execute().data

    tier, cands = await _build_candidates(run, existing)
    if not cands:
        return {"run": run, "tier": tier, "skipped": "no candidates", "cards": len(cards)}

    if tier.startswith("tier1"):
        assignment = _assign_card_centric(cards, cands)
    else:
        assignment = _assign_source_centric(cards, cands)

    # diagnostics
    name_by_id = {c["id"]: c["name"] for c in cards}
    # Cards left empty: nothing in this run's pool cleared FLOOR. Honest-empty
    # beats a fabricated wrong link, but report them so they can be refilled by
    # a targeted re-discovery run later.
    left_empty = [name_by_id[cid] for cid, lst in assignment.items() if not lst]

    report = {
        "run": run,
        "tier": tier,
        "cards": len(cards),
        "candidates": len(cands),
        "left_empty_count": len(left_empty),
        "left_empty": left_empty,
    }

    if focus_titles:
        report["focus"] = {}
        for needle in focus_titles:
            cid = next((c["id"] for c in cards if needle.lower() in c["name"].lower()), None)
            if cid:
                report["focus"][name_by_id[cid]] = [
                    (round(sc, 3), (cand.title or "")[:60])
                    for cand, sc in assignment[cid][:5]
                ]

    if apply:
        backup = _backup(run, card_ids, existing)
        stats = _apply_run(run, assignment, existing)
        report["applied"] = stats
        report["backup"] = backup

    return report


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default=None)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--focus", default=None, help="comma-separated card-name substrings to spotlight")
    args = ap.parse_args()

    focus = args.focus.split(",") if args.focus else None

    if args.run:
        runs = [args.run]
    else:
        # all multi-pillar runs (single-pillar runs were immune to the bug)
        allcards = _page("cards", "id,discovery_run_id,pillar_id")
        by_run = defaultdict(set)
        for c in allcards:
            if c.get("discovery_run_id"):
                by_run[c["discovery_run_id"]].add(c.get("pillar_id"))
        runs = [r for r, pset in by_run.items() if len(pset) > 1]

    print(f"{'APPLY' if args.apply else 'DRY-RUN'} over {len(runs)} run(s) "
          f"(FLOOR={FLOOR} MAX={MAX_PER_CARD})\n")

    agg = {"runs": 0, "cards": 0, "tier1": 0, "tier2": 0, "left_empty": 0,
           "repoints": 0, "inserts": 0, "orphaned": 0, "junctions": 0,
           "junction_failures": 0}
    for run in runs:
        rep = await process_run(run, args.apply, focus_titles=focus)
        if not rep:
            continue
        agg["runs"] += 1
        agg["cards"] += rep.get("cards", 0)
        agg["left_empty"] += rep.get("left_empty_count", 0)
        if rep["tier"].startswith("tier1"):
            agg["tier1"] += 1
        else:
            agg["tier2"] += 1
        if "applied" in rep:
            for k in ("repoints", "inserts", "orphaned", "junctions",
                      "junction_failures"):
                agg[k] += rep["applied"][k]
        print(json.dumps(rep, indent=2))
        print("-" * 60)

    print("\n=== AGGREGATE ===")
    print(json.dumps(agg, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
