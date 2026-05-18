"""Small file/format utilities shared across export generators."""

import logging
from pathlib import Path
from typing import List, Optional

from ..models.export import (
    EXPORT_CONTENT_TYPES,
    ExportFormat,
    get_export_filename,
)

logger = logging.getLogger(__name__)


def cleanup_temp_files(file_paths: List[str]) -> None:
    """Delete a set of temp chart paths, logging-but-not-raising on failure."""
    for path in file_paths:
        try:
            if path and Path(path).exists():
                Path(path).unlink()
                logger.debug(f"Cleaned up temp file: {path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temp file {path}: {e}")


def format_score_display(score: Optional[int]) -> str:
    """Render a 0-100 score for display, or ``N/A`` when None."""
    return str(score) if score is not None else "N/A"


def get_content_type(format: ExportFormat) -> str:
    """Return the MIME type for an export format (defaults to octet-stream)."""
    return EXPORT_CONTENT_TYPES.get(format, "application/octet-stream")


def generate_filename(name: str, format: ExportFormat) -> str:
    """Return a safe, extension-correct filename for an export."""
    return get_export_filename(name, format)
