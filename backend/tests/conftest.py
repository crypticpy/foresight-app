"""Pytest configuration for backend unit tests.

Sets dummy environment variables at collection time so that modules whose
import path runs through ``app.deps`` (and transitively
``app.openai_provider``) can be imported without requiring real credentials.
Tests should mock the supabase / openai clients themselves rather than
relying on these dummy values for behavior.
"""

from __future__ import annotations

import os

# Required-by-construction env vars.  We set defaults only — never override
# values the developer may have exported in their shell.
_DEFAULTS = {
    "OPENAI_API_KEY": "test-openai-key",
    "AZURE_OPENAI_API_KEY": "test-azure-openai-key",
    "AZURE_OPENAI_ENDPOINT": "https://test-azure.openai.azure.com",
    "AZURE_OPENAI_DEPLOYMENT": "test-deployment",
    "AZURE_OPENAI_EMBEDDING_DEPLOYMENT": "test-embedding-deployment",
    "AZURE_OPENAI_API_VERSION": "2024-02-15-preview",
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_KEY": "test-anon-key",
    "SUPABASE_SERVICE_KEY": "test-service-key",
    "SUPABASE_ANON_KEY": "test-anon-key",
}

for _key, _value in _DEFAULTS.items():
    os.environ.setdefault(_key, _value)
