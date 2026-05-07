"""Application startup smoke tests."""

from __future__ import annotations

import importlib


def test_app_main_imports_all_routers() -> None:
    """Importing the ASGI app catches missing router dependency exports."""
    module = importlib.import_module("app.main")

    assert module.app is not None
