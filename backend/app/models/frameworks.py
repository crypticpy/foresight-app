"""Strategic framework models for Foresight API.

Models for the framework taxonomy introduced by the FY26 reactivation:
strategic frameworks (e.g. PPP), framework categories (e.g. People, Place,
Partnerships), and drivers (second-level taxonomy nodes used for filtering).

See ``docs/11_PRD_Scoped_Workstreams_and_Frameworks.md`` §3 for the data
model and §4 for the seed data.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class Driver(BaseModel):
    id: str
    framework_category_id: str
    code: str
    name: str
    description: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    display_order: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FrameworkCategory(BaseModel):
    id: str
    framework_code: str
    code: str
    name: str
    description: Optional[str] = None
    display_order: int = 0
    drivers: List[Driver] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class StrategicFramework(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    owner_type: str = "org"
    display_order: int = 0
    categories: List[FrameworkCategory] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class StrategicFrameworkSummary(BaseModel):
    """Lightweight framework record without nested categories/drivers."""

    id: str
    code: str
    name: str
    description: Optional[str] = None
    owner_type: str = "org"
    display_order: int = 0
