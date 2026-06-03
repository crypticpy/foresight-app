"""Backfill cards.source_count to match the actual number of linked source rows.

Why: ``source_count`` is a denormalized counter that list/preview surfaces read
to show a "N sources" badge. The link-repair (PR for the signal-agent
source-index scramble) rewrote it correctly for every multi-pillar-run card via
its Pass 4, but single-pillar-run cards — which the repair never touched — carry
a pre-existing drift: 108 of them show source_count=0 while actually holding
source rows (e.g. a card with 70 sources badged "0"). This recomputes the
counter from ground truth (``sources`` rows grouped by card_id) for EVERY card,
so the badge matches the Sources panel. Idempotent and additive — it only
corrects the counter, never touches source rows or links.
"""
from __future__ import annotations

import os
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=False)
from supabase import create_client  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _page(table, select):
    out, cur = [], 0
    while True:
        rows = sb.table(table).select(select).range(cur, cur + 999).execute().data
        if not rows:
            break
        out += rows
        cur += len(rows)
        if len(rows) < 1000:
            break
    return out


def main():
    counts = defaultdict(int)
    for s in _page("sources", "card_id"):
        if s.get("card_id"):
            counts[s["card_id"]] += 1

    cards = _page("cards", "id,source_count")
    fixed = 0
    for c in cards:
        actual = counts.get(c["id"], 0)
        if (c.get("source_count") or 0) != actual:
            sb.table("cards").update({"source_count": actual}).eq("id", c["id"]).execute()
            fixed += 1
    print(f"cards scanned = {len(cards)}  corrected = {fixed}")


if __name__ == "__main__":
    main()
