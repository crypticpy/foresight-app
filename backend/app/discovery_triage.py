"""Triage stage for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D9. Owns Step 4 of the run
pipeline: scanning each raw source for prompt-injection content,
running the AI triage classifier, applying pre-print + domain
reputation confidence adjustments, and producing the
``ProcessedSource`` list that downstream stages (dedup, card
creation) consume.

The public entry point is ``triage_sources_with_metrics`` — it
returns the processed sources plus an estimated total token count
for the run's API-cost accounting. Domain reputation stats and
prompt-injection block counts are aggregated internally and (for the
former) persisted into the run's ``summary_report.quality_stats``
when a ``current_run_id`` is supplied.

Functions are stateless — they take the Supabase client, the
``AIService`` instance, and the current run id as explicit
arguments. Per-source exceptions are caught and logged so one bad
source cannot abort the rest of the batch.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

from supabase import Client

from . import domain_reputation_service
from .ai_service import AIService, TriageResult
from .research_service import ProcessedSource, RawSource
from .discovery_progress import (
    update_source_analysis,
    update_source_outcome,
    update_source_triage,
)
from .safety.injection import (
    record_injection_incident,
    scan_text as scan_for_injection,
)

logger = logging.getLogger(__name__)


async def triage_sources_with_metrics(
    supabase: Client,
    ai_service: AIService,
    sources: List[RawSource],
    *,
    current_run_id: Optional[str] = None,
) -> Tuple[List[ProcessedSource], Dict[str, int]]:
    """
    Triage sources for municipal relevance with token usage tracking.

    For each source: scan for prompt-injection patterns and drop if a
    blocking match is found, then run the AI triage classifier (or
    auto-pass URL-only sources at 0.65 confidence), apply the
    pre-print and domain-reputation confidence adjustments, and gate
    on ``triage_threshold = 0.6``. Sources that pass go on to full
    analysis + embedding and become ``ProcessedSource`` instances.

    Per-source exceptions are caught and logged so one bad source
    cannot abort the rest of the batch. Domain-reputation stats are
    persisted into ``discovery_runs.summary_report.quality_stats``
    when ``current_run_id`` is supplied.

    Returns ``(processed_sources, token_breakdown)`` where
    ``token_breakdown`` is a dict keyed by ``APITokenUsage`` operation
    name — ``triage``, ``analysis``, ``embedding`` — and valued by the
    estimated token count for each. The previous version returned a
    single int aggregating all three, which the caller then attributed
    entirely to the ``triage`` bucket via
    ``api_token_usage.add_tokens("triage", ...)``: that silently
    inflated ``triage_tokens`` and left ``analysis_tokens`` /
    ``embedding_tokens`` permanently zero in every recorded run.
    """
    processed: List[ProcessedSource] = []
    triage_threshold = 0.6
    # Per-operation accumulators so callers can attribute each bucket
    # correctly. Returned as a dict keyed by ``APITokenUsage``
    # operation name (matches the dataclass's ``add_tokens`` contract).
    triage_tokens_total = 0
    analysis_tokens_total = 0
    embedding_tokens_total = 0

    # Domain reputation stats tracking (Task 2.7)
    domain_rep_stats = {
        "domain_reputation_lookups": 0,
        "confidence_adjustments": 0,
        "tier1_source_count": 0,
        "tier2_source_count": 0,
        "tier3_source_count": 0,
        "untiered_source_count": 0,
    }

    injection_block_count = 0

    for source in sources:
        try:
            # Prompt-injection scan (PR 5): patterns are cheap, the LLM
            # call we'd make next is not. On any HIGH-severity match,
            # log incidents to safety_incidents and drop the source so
            # its payload never reaches the triage LLM. We scan title +
            # content (the title alone flows into the auto-pass path
            # below, so a malicious title must still be blocked).
            scan_target = "\n\n".join(
                part for part in (source.title, source.content) if part
            )
            if scan_target:
                matches = scan_for_injection(scan_target)
                blocking = [m for m in matches if m.is_blocking]
                if blocking:
                    injection_block_count += 1
                    logger.warning(
                        "Discovery: blocking source %s due to injection patterns: %s",
                        source.url or "(no url)",
                        [m.pattern_id for m in blocking],
                    )
                    await asyncio.to_thread(
                        record_injection_incident,
                        supabase,
                        matches=blocking,
                        source="discovery",
                        discovered_source_id=source.discovered_source_id,
                        metadata={
                            "url": source.url,
                            "title": source.title,
                            "run_id": current_run_id,
                        },
                    )
                    if source.discovered_source_id:
                        await update_source_outcome(
                            supabase,
                            source.discovered_source_id,
                            "filtered_blocked",
                            error_message="prompt_injection",
                            error_stage="triage",
                        )
                    continue

            # Skip sources without content for full triage
            if not source.content:
                # Auto-pass URL-only sources with lower confidence
                triage = TriageResult(
                    is_relevant=True,
                    confidence=0.65,
                    primary_pillar=getattr(source, "pillar_code", None),
                    reason="Auto-passed (no content)",
                )
            else:
                triage = await ai_service.triage_source(
                    title=source.title, content=source.content
                )
                # Estimate tokens: ~4 chars per token for input, fixed output
                input_tokens = (
                    len(source.title or "") // 4 + len(source.content or "") // 4
                )
                output_tokens = 100  # Estimated output tokens for triage
                triage_tokens_total += input_tokens + output_tokens

            # Pre-print relevance penalty (Task 2.6): soft penalty, not a hard block
            if getattr(source, "is_preprint", False) and triage.confidence > 0:
                original_confidence = triage.confidence
                triage.confidence = max(0.0, triage.confidence - 0.2)
                logger.debug(
                    f"Pre-print penalty applied: {source.url} "
                    f"confidence {original_confidence:.2f} -> {triage.confidence:.2f}"
                )

            # Domain reputation confidence adjustment (Task 2.7)
            try:
                reputation = domain_reputation_service.get_reputation(
                    supabase, source.url or ""
                )
                domain_rep_stats["domain_reputation_lookups"] += 1

                # Track tier distribution
                if reputation:
                    tier = reputation.get("curated_tier")
                    if tier == 1:
                        domain_rep_stats["tier1_source_count"] += 1
                    elif tier == 2:
                        domain_rep_stats["tier2_source_count"] += 1
                    elif tier == 3:
                        domain_rep_stats["tier3_source_count"] += 1
                    else:
                        domain_rep_stats["untiered_source_count"] += 1
                else:
                    domain_rep_stats["untiered_source_count"] += 1

                adj = domain_reputation_service.get_confidence_adjustment(reputation)
                if adj != 0.0:
                    pre_adj_confidence = triage.confidence
                    triage.confidence = max(0.0, min(1.0, triage.confidence + adj))
                    domain_rep_stats["confidence_adjustments"] += 1
                    logger.debug(
                        f"Domain reputation adjustment: {source.url} "
                        f"adj={adj:+.2f} confidence "
                        f"{pre_adj_confidence:.2f} -> {triage.confidence:.2f}"
                    )
            except Exception as e:
                logger.debug(f"Domain reputation lookup failed (non-fatal): {e}")

            # Determine triage pass/fail
            passed_triage = (
                triage.is_relevant and triage.confidence >= triage_threshold
            )

            # Record triage result for domain reputation stats (Task 2.7)
            try:
                if _domain := urlparse(source.url or "").netloc:
                    domain_reputation_service.record_triage_result(
                        supabase, _domain, passed=passed_triage
                    )
            except Exception as e:
                logger.debug(f"Domain triage recording failed (non-fatal): {e}")

            # Persist the triage decision onto ``discovered_sources`` so the
            # observability UI can show *why* a source was kept or dropped.
            # Skipped silently if the source wasn't persisted (workstream
            # scans, ad-hoc invocations without a registry-row id).
            if source.discovered_source_id:
                try:
                    await update_source_triage(
                        supabase,
                        source.discovered_source_id,
                        triage,
                        passed_triage,
                    )
                except Exception as e:
                    logger.debug(
                        f"update_source_triage failed (non-fatal): {e}"
                    )

            if passed_triage:
                # Full analysis
                analysis = await ai_service.analyze_source(
                    title=source.title,
                    content=source.content or "",
                    source_name=source.source_name,
                    published_at=datetime.now(timezone.utc).isoformat(),
                )
                # Estimate tokens for analysis
                input_tokens = (
                    len(source.title or "") // 4 + len(source.content or "") // 4
                )
                output_tokens = 500  # Estimated output tokens for analysis
                analysis_tokens_total += input_tokens + output_tokens

                # Persist the analysis result onto ``discovered_sources``
                # so the operator-facing UI can show extracted entities /
                # summary / pillar without having to wait for card
                # creation. Mirrors the dead ``_triage_sources`` path.
                if source.discovered_source_id:
                    try:
                        await update_source_analysis(
                            supabase,
                            source.discovered_source_id,
                            analysis,
                        )
                    except Exception as e:
                        logger.debug(
                            f"update_source_analysis failed (non-fatal): {e}"
                        )

                # Generate embedding
                embed_text = f"{source.title} {analysis.summary}"
                embedding = await ai_service.generate_embedding(embed_text)
                # Estimate tokens for embedding
                embedding_tokens_total += len(embed_text) // 4

                processed.append(
                    ProcessedSource(
                        raw=source,
                        triage=triage,
                        analysis=analysis,
                        embedding=embedding,
                    )
                )

        except Exception as e:
            logger.warning(f"Triage/analysis failed for {source.url}: {e}")
            # Record the pipeline-stage failure onto ``discovered_sources``
            # so the row reflects why it dropped out, instead of looking
            # like the source vanished silently. Mirrors the dead
            # ``_triage_sources`` path.
            if source.discovered_source_id:
                try:
                    await update_source_outcome(
                        supabase,
                        source.discovered_source_id,
                        "error",
                        error_message=str(e),
                        error_stage="triage",
                    )
                except Exception as hook_err:
                    logger.debug(
                        f"update_source_outcome failed (non-fatal): {hook_err}"
                    )
            continue

    if injection_block_count:
        logger.info(
            "Discovery triage: blocked %d source(s) on prompt-injection patterns",
            injection_block_count,
        )

    # Log domain reputation stats (Task 2.7)
    if domain_rep_stats["domain_reputation_lookups"] > 0:
        logger.info(
            f"Domain reputation triage stats: "
            f"{domain_rep_stats['domain_reputation_lookups']} lookups, "
            f"{domain_rep_stats['confidence_adjustments']} adjustments, "
            f"tier1={domain_rep_stats['tier1_source_count']}, "
            f"tier2={domain_rep_stats['tier2_source_count']}, "
            f"tier3={domain_rep_stats['tier3_source_count']}, "
            f"untiered={domain_rep_stats['untiered_source_count']}"
        )

    # Persist domain reputation stats to quality_stats (Task 2.7)
    try:
        if current_run_id:
            existing = (
                supabase.table("discovery_runs")
                .select("summary_report")
                .eq("id", current_run_id)
                .single()
                .execute()
            )
            report = (existing.data.get("summary_report") if existing.data else {}) or {}
            if not isinstance(report, dict):
                report = {}
            qs = report.get("quality_stats", {})
            qs.update(domain_rep_stats)
            report["quality_stats"] = qs
            supabase.table("discovery_runs").update(
                {"summary_report": report}
            ).eq("id", current_run_id).execute()
    except Exception as e:
        logger.debug(f"Failed to persist domain reputation stats: {e}")

    return processed, {
        "triage": triage_tokens_total,
        "analysis": analysis_tokens_total,
        "embedding": embedding_tokens_total,
    }
