"""
Public-API contract tests for the discovery pipeline modules.

These tests assert that the public symbols other parts of the codebase
(and external integration scripts such as ``scripts/run_e2e_pipeline.py``)
rely on continue to exist. They are cheap import-time checks — no network,
no Supabase, no OpenAI — and run on every ``pytest`` invocation.
"""

import importlib
import importlib.util

import pytest


def test_source_fetchers_public_api_contract() -> None:
    """Verify source_fetchers keeps the public exports used by integrations."""
    module_name = "app.source_fetchers"
    source_fetchers_module = importlib.import_module(module_name)

    expected_attrs = [
        "fetch_rss_sources",
        "FetchedArticle",
        "fetch_news_articles",
        "NewsArticle",
        "fetch_academic_papers",
        "AcademicPaper",
        "fetch_government_sources",
        "GovernmentDocument",
        "fetch_tech_blog_articles",
        "TechBlogArticle",
    ]

    for attr in expected_attrs:
        assert hasattr(source_fetchers_module, attr), (
            f"{module_name} is expected to expose {attr}, but it was not found."
        )


def test_discovery_service_public_api_contract() -> None:
    """Verify discovery_service keeps its public orchestration symbols."""
    if importlib.util.find_spec("supabase") is None:
        pytest.skip("supabase not available - skipping discovery_service contract test")

    module_name = "app.discovery_service"
    discovery_module = importlib.import_module(module_name)

    expected_attrs = [
        "DiscoveryService",
        "DiscoveryConfig",
        "SourceCategory",
        "SourceCategoryConfig",
        "MultiSourceFetchResult",
        "SourceDiversityMetrics",
        "ProcessingTimeMetrics",
        "APITokenUsage",
    ]

    for attr in expected_attrs:
        assert hasattr(discovery_module, attr), (
            f"{module_name} is expected to expose {attr}, but it was not found."
        )


def test_validation_models_public_api_contract() -> None:
    """Verify validation model exports remain importable."""
    module_name = "app.models.validation"
    validation_module = importlib.import_module(module_name)

    expected_attrs = [
        "ClassificationValidation",
        "ClassificationValidationCreate",
        "ClassificationAccuracyMetrics",
        "ValidationSummary",
        "ClassificationConfusionMatrix",
        "VALID_PILLAR_CODES",
    ]

    for attr in expected_attrs:
        assert hasattr(validation_module, attr), (
            f"{module_name} is expected to expose {attr}, but it was not found."
        )
