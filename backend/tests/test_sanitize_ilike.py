"""Unit tests for ``sanitize_ilike`` — escape LIKE metacharacters.

Surfaced by the Sentinel security audit (P1 #5) during the
``fix/bug-hunt-sweep`` chorus pass. Supabase's ``.ilike()`` does not escape
``%`` / ``_`` / ``\\``, so a caller that interpolates raw user input into
the pattern silently turns those characters into wildcards. The helper
escapes them with the default ``\\`` escape character so they're treated
as literal text by Postgres.
"""

from app.helpers.search_utils import sanitize_ilike


def test_passes_through_plain_text():
    assert sanitize_ilike("hello world") == "hello world"


def test_escapes_percent_sign():
    # Without escaping, "%" matches any string of any length in LIKE.
    assert sanitize_ilike("100%") == "100\\%"


def test_escapes_underscore():
    # Without escaping, "_" matches any single character in LIKE.
    assert sanitize_ilike("a_b") == "a\\_b"


def test_escapes_star_wildcard():
    # PostgREST treats "*" as an alias for "%" inside ilike values, so an
    # attacker passing "*" must be escaped the same way as "%".
    assert sanitize_ilike("a*b") == "a\\*b"
    assert sanitize_ilike("*") == "\\*"


def test_escapes_backslash_first():
    # Backslash must be escaped *before* %/_ are escaped, otherwise the
    # backslashes we add to escape them would themselves be re-escaped.
    assert sanitize_ilike("a\\b") == "a\\\\b"


def test_handles_combined_metacharacters():
    # Order matters: a single input with every metacharacter round-trips
    # to a single, well-formed escaped pattern.
    assert sanitize_ilike("50%_*done\\") == "50\\%\\_\\*done\\\\"


def test_attacker_wildcard_becomes_literal():
    # An attacker passing "%" to a search endpoint should not be able to
    # match every row in the table.
    escaped = sanitize_ilike("%")
    assert escaped == "\\%"
    # The escaped pattern, wrapped in %...% by the caller, is a search for
    # the literal "%" character — not "match everything".
    assert f"%{escaped}%" == "%\\%%"


def test_empty_string():
    assert sanitize_ilike("") == ""
