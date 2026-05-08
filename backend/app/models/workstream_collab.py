"""Pydantic models for Phase 3 workstream collaboration."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, validator


WorkstreamMemberRole = Literal["owner", "editor", "commenter", "viewer"]
AccountType = Literal["paid", "guest"]
CommentTargetType = Literal["card", "workstream", "portfolio", "brief"]
ShareTargetType = Literal["portfolio", "brief", "card"]
ReactionEmoji = Literal["thumbs_up", "target", "flag", "check", "question"]


class WorkstreamMember(BaseModel):
    user_id: str
    email: str | None = None
    display_name: str | None = None
    role: WorkstreamMemberRole
    added_by: str | None = None
    created_at: datetime | str | None = None


class WorkstreamMemberCreate(BaseModel):
    user_email: str = Field(..., min_length=3, max_length=320)
    role: Literal["editor", "commenter", "viewer"]

    @validator("user_email")
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class WorkstreamMemberUpdate(BaseModel):
    role: Literal["editor", "commenter", "viewer"]


class WorkstreamInviteCreate(BaseModel):
    email: str | None = Field(default=None, max_length=320)
    role: Literal["editor", "commenter", "viewer"]
    intended_account_type: AccountType = "paid"
    expires_in_days: int = Field(default=14, ge=1, le=30)

    @validator("email")
    def normalize_optional_email(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else None


class WorkstreamInvite(BaseModel):
    id: str
    workstream_id: str
    email: str | None = None
    intended_role: str
    intended_account_type: AccountType
    token: str | None = None
    share_url: str | None = None
    created_by: str
    expires_at: datetime | str
    consumed_at: datetime | str | None = None
    consumed_by: str | None = None
    revoked_at: datetime | str | None = None
    created_at: datetime | str


class WorkstreamInviteCreateResponse(BaseModel):
    invite_id: str
    token: str
    share_url: str
    expires_at: datetime | str


class WorkstreamInvitePreview(BaseModel):
    workstream_id: str
    workstream_name: str
    inviter_display_name: str | None = None
    inviter_email: str | None = None
    intended_role: str
    intended_account_type: AccountType
    email: str | None = None
    expires_at: datetime | str


class InviteAcceptResponse(BaseModel):
    workstream_id: str
    role: str
    status: Literal["accepted", "already_member"]


class CompleteSignupRequest(BaseModel):
    invite_token: str


class CommentCreate(BaseModel):
    target_type: CommentTargetType
    target_id: str
    workstream_id: str | None = None
    body_markdown: str = Field(..., min_length=1, max_length=10000)
    parent_id: str | None = None


class CommentUpdate(BaseModel):
    body_markdown: str | None = Field(default=None, min_length=1, max_length=10000)
    resolved: bool | None = None


class CommentReactionToggle(BaseModel):
    emoji: ReactionEmoji


class CommentResponse(BaseModel):
    id: str
    target_type: str
    target_id: str
    workstream_id: str | None = None
    parent_id: str | None = None
    author_id: str | None = None
    author_display_name: str | None = None
    body_markdown: str
    body_html: str | None = None
    mentions: list[str] = Field(default_factory=list)
    resolved_at: datetime | str | None = None
    edited_at: datetime | str | None = None
    deleted_at: datetime | str | None = None
    created_at: datetime | str
    reactions: dict[str, int] = Field(default_factory=dict)
    my_reactions: list[str] = Field(default_factory=list)


class ActivityEvent(BaseModel):
    id: str
    workstream_id: str
    actor_id: str | None = None
    actor_display_name: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | str


class NotificationItem(BaseModel):
    id: str
    kind: str
    workstream_id: str | None = None
    actor_id: str | None = None
    target_type: str | None = None
    target_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    read_at: datetime | str | None = None
    created_at: datetime | str


class MarkNotificationsReadRequest(BaseModel):
    ids: list[str] | None = None


class ShareLinkCreate(BaseModel):
    target_type: ShareTargetType
    target_id: str
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ShareLinkResponse(BaseModel):
    id: str
    target_type: str
    target_id: str
    token: str | None = None
    share_url: str | None = None
    expires_at: datetime | str | None = None
    revoked_at: datetime | str | None = None
    view_count: int = 0
    last_viewed_at: datetime | str | None = None
    created_at: datetime | str


class PublicSharePayload(BaseModel):
    target_type: str
    target_id: str
    data: dict[str, Any]
    created_by_name: str | None = None
    created_by_email: str | None = None
    expires_at: datetime | str | None = None
    watermark: str = "Foresight - City of Austin"


class PresenceHeartbeatResponse(BaseModel):
    workstream_id: str
    user_id: str
    last_seen_at: datetime | str
