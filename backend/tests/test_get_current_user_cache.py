"""Regression tests for the ``get_current_user`` profile TTL cache in
``app.deps``.

The cache lives in ``app.deps._user_profile_cache`` and exists to avoid
hitting Supabase on every authenticated request (``get_current_user`` runs
on essentially every API call). Two invariants matter:

1. **TTL eviction (``_CACHE_TTL`` = 300s)** — a stale entry must never be
   served. If TTL silently breaks, an admin demoted via
   ``/admin/users/{id}`` could keep hitting admin endpoints for up to
   ``_CACHE_TTL`` seconds even after eviction. A regression in the *other*
   direction (e.g. caching forever) means stale ``account_type`` / ``role``
   values leak indefinitely.

2. **Size cap (1000 entries)** — the worker / web process is long-lived,
   so an unbounded cache would gradually OOM as new JWTs (rotated tokens,
   new users, password resets) accumulate. The current implementation
   evicts the oldest-by-timestamp entry whenever ``len > 1000`` *before*
   inserting the next one, so the cache strictly cannot exceed 1001 in
   steady state (the check fires the entry after the trigger has been
   inserted but the next insertion immediately trims it).

The Supabase round-trip is the only externally-observable side effect, so
each test stubs ``supabase.auth.get_user`` + ``supabase.table(...)`` and
counts how many profile fetches occurred. JWT verification itself is the
responsibility of Supabase Auth and is out of scope for these tests.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest

from app import deps


# ---------------------------------------------------------------------------
# Supabase stub — only models the methods ``get_current_user`` actually
# exercises: ``.auth.get_user(token)`` and
# ``.table("users").select("*").eq("id", uid).execute()``. Every call is
# counted so tests can assert exactly how many DB round-trips happened.
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _UsersQuery:
    """Mimics the chained PostgREST builder for the ``users`` table."""

    def __init__(self, stub: "_SupabaseStub"):
        self._stub = stub
        self._id_filter: str | None = None

    def select(self, *_columns, **_kw) -> "_UsersQuery":
        return self

    def eq(self, key: str, value: Any) -> "_UsersQuery":
        if key == "id":
            self._id_filter = value
        return self

    def execute(self) -> _Resp:
        self._stub.profile_calls += 1
        if self._id_filter is None:
            return _Resp([])
        row = self._stub.profiles.get(self._id_filter)
        # Real PostgREST returns freshly-deserialized rows, not references
        # into a server-side dict — return a shallow copy so test mutations
        # of ``stub.profiles`` only affect *subsequent* fetches, never
        # already-returned (and now-cached) payloads.
        return _Resp([dict(row)] if row else [])


class _SupabaseStub:
    """Records how many times each Supabase code path was invoked."""

    def __init__(
        self,
        tokens_to_user_ids: Dict[str, str],
        profiles: Dict[str, Dict[str, Any]],
    ):
        self.tokens_to_user_ids = tokens_to_user_ids
        self.profiles = profiles
        self.auth_calls = 0
        self.profile_calls = 0
        self.auth = self._Auth(self)

    class _Auth:
        def __init__(self, parent: "_SupabaseStub"):
            self._parent = parent

        def get_user(self, token: str):
            self._parent.auth_calls += 1
            user_id = self._parent.tokens_to_user_ids.get(token)
            response = MagicMock()
            if user_id is None:
                response.user = None
            else:
                # The real ``supabase.auth.get_user`` response exposes
                # ``response.user.id``; mirror that exact shape.
                response.user = MagicMock()
                response.user.id = user_id
            return response

    def table(self, name: str) -> _UsersQuery:
        if name != "users":
            raise AssertionError(
                f"get_current_user must only query the 'users' table, got: {name!r}"
            )
        return _UsersQuery(self)


def _make_creds(token: str):
    """Build the ``HTTPAuthorizationCredentials`` shape FastAPI hands in."""
    creds = MagicMock()
    creds.credentials = token
    return creds


def _make_request():
    """Minimal ``Request`` stub — ``get_current_user`` only passes it to
    ``log_security_event`` on error paths, which the happy-path tests do
    not exercise."""
    return MagicMock()


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_profile_cache():
    """The cache is a module-global ``dict``; isolate every test by
    clearing it before and after so test order can never matter."""
    deps._user_profile_cache.clear()
    yield
    deps._user_profile_cache.clear()


USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
TOKEN_A = "x" * 40  # > 20 chars required by the length guard in get_current_user
TOKEN_B = "y" * 40


def _profile(user_id: str, role: str = "user", account_type: str = "paid"):
    return {"id": user_id, "role": role, "account_type": account_type}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_cache_hit_within_ttl_skips_supabase_lookup(monkeypatch):
    """Two back-to-back calls for the same token inside the TTL window must
    hit Supabase Auth twice (token verification is intentionally NOT
    cached — JWT revocation must take immediate effect) but must hit the
    ``users`` table exactly once. The second call is served from the TTL
    cache."""
    stub = _SupabaseStub(
        tokens_to_user_ids={TOKEN_A: USER_A},
        profiles={USER_A: _profile(USER_A)},
    )
    monkeypatch.setattr(deps, "supabase", stub)

    # Freeze the clock to a point well inside the TTL window. Use the
    # module-bound ``time`` import so both the cache writer
    # (``_set_cached_profile``) and the reader (``_get_cached_profile``)
    # see the same clock.
    fake_now = {"t": 1_000_000.0}
    monkeypatch.setattr(deps.time, "time", lambda: fake_now["t"])

    first = _run(deps.get_current_user(_make_request(), _make_creds(TOKEN_A)))
    fake_now["t"] += deps._CACHE_TTL - 1  # still inside the TTL window
    second = _run(deps.get_current_user(_make_request(), _make_creds(TOKEN_A)))

    assert first["id"] == USER_A
    assert second["id"] == USER_A
    assert stub.profile_calls == 1, (
        f"Expected exactly 1 profile fetch (second call should be cached), "
        f"got {stub.profile_calls}. TTL cache regressed."
    )
    # Auth verification is intentionally NOT cached — JWT revocation must
    # take effect on the next request. Pin that invariant explicitly so a
    # regression that starts caching auth gets caught here.
    assert stub.auth_calls == 2, (
        f"Expected Supabase Auth to run on both requests (token verification "
        f"must NOT be cached), got {stub.auth_calls}. Auth caching regressed — "
        "revoked tokens would keep working until TTL expiry."
    )


def test_cache_expires_after_ttl(monkeypatch):
    """A call after the TTL window has elapsed must re-fetch the profile.
    If this regresses, demoted admins keep their admin profile forever."""
    stub = _SupabaseStub(
        tokens_to_user_ids={TOKEN_A: USER_A},
        profiles={USER_A: _profile(USER_A)},
    )
    monkeypatch.setattr(deps, "supabase", stub)

    fake_now = {"t": 2_000_000.0}
    monkeypatch.setattr(deps.time, "time", lambda: fake_now["t"])

    first = _run(deps.get_current_user(_make_request(), _make_creds(TOKEN_A)))
    assert stub.profile_calls == 1
    assert first["role"] == "user"

    # Simulate an out-of-band profile mutation (e.g. admin demotion) while
    # the cached entry is still resident. Without TTL eviction the second
    # call would keep returning the stale ``role`` value.
    stub.profiles[USER_A]["role"] = "admin"

    # Advance past the TTL boundary. ``_CACHE_TTL`` is read from the
    # module so this test stays correct if the constant is tuned.
    fake_now["t"] += deps._CACHE_TTL + 1

    second = _run(deps.get_current_user(_make_request(), _make_creds(TOKEN_A)))
    assert stub.profile_calls == 2, (
        f"Expected the post-TTL call to re-fetch the profile, but profile "
        f"fetch count is {stub.profile_calls}. TTL eviction is broken — "
        "stale role / account_type values will be served indefinitely."
    )
    # The post-TTL response must reflect the underlying mutation. Without
    # this, a regression that re-increments ``profile_calls`` but still
    # serves the cached payload (e.g. eviction firing after the read) would
    # slip through the count-only check above.
    assert second["role"] == "admin", (
        f"Post-TTL call returned stale role {second['role']!r} — the cache "
        "evicted the count but kept serving the old payload."
    )
    assert first != second, (
        "Pre-TTL and post-TTL payloads are identical despite an underlying "
        "profile mutation; cache is serving a stale snapshot."
    )

    # And the stale entry must have been evicted by ``_get_cached_profile``
    # on the missed read, not silently overwritten. After the re-fetch a
    # fresh entry should be back in the cache.
    assert USER_A in deps._user_profile_cache


def test_cache_keyed_per_user(monkeypatch):
    """Two distinct users called back-to-back must each get their own
    profile — no cross-user serving. If the cache key were ever derived
    from the JWT bytes instead of the resolved user_id (or vice versa
    flipped), this test trips immediately."""
    stub = _SupabaseStub(
        tokens_to_user_ids={TOKEN_A: USER_A, TOKEN_B: USER_B},
        profiles={
            USER_A: _profile(USER_A, role="user"),
            USER_B: _profile(USER_B, role="admin"),
        },
    )
    monkeypatch.setattr(deps, "supabase", stub)

    fake_now = {"t": 3_000_000.0}
    monkeypatch.setattr(deps.time, "time", lambda: fake_now["t"])

    profile_a = _run(deps.get_current_user(_make_request(), _make_creds(TOKEN_A)))
    profile_b = _run(deps.get_current_user(_make_request(), _make_creds(TOKEN_B)))

    assert profile_a["id"] == USER_A
    assert profile_a["role"] == "user"
    assert profile_b["id"] == USER_B
    assert profile_b["role"] == "admin"

    # Both users were uncached on first call, so two profile fetches.
    assert stub.profile_calls == 2

    # Re-request user A — must come from cache and carry user A's role.
    profile_a_again = _run(
        deps.get_current_user(_make_request(), _make_creds(TOKEN_A))
    )
    assert profile_a_again["id"] == USER_A
    assert profile_a_again["role"] == "user"
    assert stub.profile_calls == 2, (
        "User A's second call must be served from cache; got an extra "
        f"profile fetch (total={stub.profile_calls})."
    )

    # And both entries coexist in the cache — neither evicted the other.
    assert USER_A in deps._user_profile_cache
    assert USER_B in deps._user_profile_cache


def test_cache_respects_max_size_cap(monkeypatch):
    """Adding more than 1000 distinct users must NOT let the cache grow
    unbounded. The current eviction policy in ``_set_cached_profile``
    drops the oldest-by-timestamp entry whenever ``len > 1000`` *before*
    inserting the next profile, so the steady-state size stays at or just
    above the cap. Without this, the cache becomes an unbounded memory
    leak as JWTs rotate over the lifetime of a long-running worker."""
    n_users = 1_050  # comfortably past the 1000 cap
    tokens_to_user_ids = {f"tok-{i:04d}-" + "z" * 30: f"user-{i:04d}" for i in range(n_users)}
    profiles = {uid: _profile(uid) for uid in tokens_to_user_ids.values()}

    stub = _SupabaseStub(
        tokens_to_user_ids=tokens_to_user_ids,
        profiles=profiles,
    )
    monkeypatch.setattr(deps, "supabase", stub)

    # Use a monotonically increasing fake clock so that oldest-eviction
    # has a well-defined "oldest" entry to pick.
    counter = {"t": 4_000_000.0}

    def _tick():
        counter["t"] += 1.0
        return counter["t"]

    monkeypatch.setattr(deps.time, "time", _tick)

    tokens_in_order = list(tokens_to_user_ids.keys())
    for token in tokens_in_order:
        _run(deps.get_current_user(_make_request(), _make_creds(token)))

    cap = 1000
    # The eviction check is ``if len(...) > 1000: evict_oldest`` and then
    # the new entry is inserted, so the cache is allowed to briefly sit at
    # cap+1 between operations. The hard invariant is: it must NOT keep
    # growing with each new user past the cap.
    assert len(deps._user_profile_cache) <= cap + 1, (
        f"Profile cache grew to {len(deps._user_profile_cache)} entries "
        f"after {n_users} distinct users — size-cap eviction in "
        "_set_cached_profile is broken. This is an OOM risk in long-running "
        "workers as JWTs rotate."
    )

    # And the most-recently-added user MUST still be in the cache —
    # eviction must drop *oldest*, not newest.
    newest_user_id = tokens_to_user_ids[tokens_in_order[-1]]
    assert newest_user_id in deps._user_profile_cache, (
        "Most recently added user was evicted instead of the oldest — "
        "eviction policy is inverted."
    )

    # The very first user (oldest timestamp) MUST have been evicted by
    # now, proving the policy actually fires rather than silently passing
    # the size check.
    oldest_user_id = tokens_to_user_ids[tokens_in_order[0]]
    assert oldest_user_id not in deps._user_profile_cache, (
        "Oldest user was not evicted — _set_cached_profile's "
        "oldest-by-timestamp eviction did not run."
    )
