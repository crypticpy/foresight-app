"""Query generation + search execution for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D8. Owns Step 2 and Step 3
of the run pipeline:

- ``generate_queries`` — produce ``QueryConfig`` list from a
  ``DiscoveryConfig``, either by trusting a caller-supplied
  ``custom_queries`` payload (coverage-balancer path) or by delegating
  to ``QueryGenerator`` for the pillar/horizon defaults.
- ``execute_single_search`` — run one query through
  ``ResearchService._discover_sources`` with a fixed 210s inner cap,
  apply per-query source caps, and stamp pillar/priority/horizon
  context onto each returned ``RawSource``.
- ``execute_searches`` — execute the full query list in concurrent
  batches (``query_batch_size``, default 5), deduplicate sources by
  URL across batches, honour ``max_sources_total`` as a hard ceiling,
  and sleep 1s between batches to spread rate-limit pressure.

Functions are stateless: they take the ``QueryGenerator`` /
``ResearchService`` instance as an explicit argument. Both
``execute_*`` helpers swallow per-query exceptions and log warnings,
matching the original instance-method behaviour so a single bad query
cannot abort the whole search step.

``QUERY_BATCH_SIZE`` is exported as the single source of truth so
``DiscoveryService.run`` can derive the outer step-level wrapper
timeout from the same constant the batch loop reads.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Tuple

from .discovery_config import DiscoveryConfig
from .query_generator import QueryConfig, QueryGenerator
from .research_service import RawSource, ResearchService

logger = logging.getLogger(__name__)

# Single source of truth for the query batch size used in
# ``execute_searches``. The outer step-level timeout in
# ``DiscoveryService.run`` derives ``num_batches`` from this value;
# keeping them in sync prevents an under-estimated wrapper timeout
# from firing mid-batch.
QUERY_BATCH_SIZE = 5


async def generate_queries(
    query_generator: QueryGenerator, config: DiscoveryConfig
) -> List[QueryConfig]:
    """
    Generate search queries for a discovery run.

    If ``config.custom_queries`` is set (the coverage-balancer path,
    where a caller has pre-built queries for a starved CSP goal),
    trust that list and cap at ``max_queries_per_run``. Otherwise fall
    back to ``QueryGenerator.generate_queries`` with the pillar /
    horizon / priority filters from ``config``.
    """
    if config.custom_queries:
        # Coverage-balancer path: caller pre-built the list (e.g. LLM-derived
        # queries for a starved CSP goal). Trust them and cap at
        # max_queries_per_run so the global budget still applies.
        limit = config.max_queries_per_run or len(config.custom_queries)
        return list(config.custom_queries[:limit])
    return query_generator.generate_queries(
        pillars_filter=config.pillars_filter or None,
        horizons=config.horizons_filter or None,
        include_priorities=config.include_priorities,
        max_queries=config.max_queries_per_run,
    )


async def execute_single_search(
    research_service: ResearchService,
    query: QueryConfig,
    config: DiscoveryConfig,
) -> Tuple[List[RawSource], float]:
    """
    Execute a single search query against ``ResearchService``.

    Returns ``([], 0.0)`` on timeout or any exception so the caller can
    keep gathering other queries' results. Stamps the query's pillar
    code, priority id and horizon target onto each returned source so
    downstream stages can attribute the hit.
    """
    try:
        # The discovery pipeline only consumes the source list; the synthesized
        # report is discarded. Skip write_report (saves up to 60s/query) and
        # give the inner Serper+gpt-researcher chain room to finish: Serper
        # baseline (≤30s, up to 10 sequential crawls) + gpt-researcher
        # conduct_research (≤150s) ≈ 180s nominal. Outer timeout sits at 210s
        # to leave headroom for dedup/title-gen overhead so a successful inner
        # run isn't cancelled by the wrapper.
        sources, _report, cost = await asyncio.wait_for(
            research_service._discover_sources(
                query=query.query_text,
                report_type="research_report",
                skip_report=True,
            ),
            timeout=210,
        )

        # Limit sources per query
        sources = sources[: config.max_sources_per_query]

        # Add query context to sources for tracking
        for source in sources:
            # Store query context in source for later use
            source.pillar_code = query.pillar_code  # type: ignore
            source.priority_id = query.priority_id  # type: ignore
            source.horizon_target = query.horizon_target  # type: ignore

        return sources, cost

    except asyncio.TimeoutError:
        logger.warning(
            f"Search timed out for query '{query.query_text[:50]}...' (210s)"
        )
        return [], 0.0
    except Exception as e:
        logger.warning(f"Search failed for query '{query.query_text[:50]}...': {e}")
        return [], 0.0


async def execute_searches(
    research_service: ResearchService,
    queries: List[QueryConfig],
    config: DiscoveryConfig,
    query_batch_size: int = QUERY_BATCH_SIZE,
) -> Tuple[List[RawSource], float]:
    """
    Execute every query in concurrent batches.

    Batches of ``query_batch_size`` queries run via ``asyncio.gather``
    with ``return_exceptions=True`` so one failure cannot abort the
    rest. After each batch the result list is deduplicated by URL and
    accumulated; if ``max_sources_total`` is reached the loop exits
    early. A 1s sleep between batches spreads rate-limit pressure
    against Serper / gpt-researcher.

    Returns ``(sources_capped_at_max, total_cost)``.
    """
    all_sources: List[RawSource] = []
    total_cost = 0.0
    seen_urls: set = set()

    # Process queries in batches to avoid rate limits
    for i in range(0, len(queries), query_batch_size):
        batch = queries[i : i + query_batch_size]

        # Execute batch concurrently
        tasks = [
            execute_single_search(research_service, query, config) for query in batch
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Search failed: {result}")
                continue

            sources, cost = result
            total_cost += cost

            # Deduplicate by URL
            for source in sources:
                if source.url and source.url not in seen_urls:
                    seen_urls.add(source.url)
                    all_sources.append(source)

        # Check if we've hit the total source limit
        if len(all_sources) >= config.max_sources_total:
            logger.info(f"Hit max_sources_total limit ({config.max_sources_total})")
            break

        # Small delay between batches to avoid rate limiting
        if i + query_batch_size < len(queries):
            await asyncio.sleep(1)

    return all_sources[: config.max_sources_total], total_cost
