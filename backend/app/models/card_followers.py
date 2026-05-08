"""Models for card follower state."""

from pydantic import BaseModel


class CardFollowerResponse(BaseModel):
    follower_count: int = 0
    is_following: bool = False


class FollowToggleResponse(CardFollowerResponse):
    pass

