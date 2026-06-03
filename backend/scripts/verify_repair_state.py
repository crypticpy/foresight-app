"""Read-only post-apply verification of the source-link repair.

Confirms the PRIMARY fix held in prod: the reported animal-shelter card now
shows animal sources, plus a few tier-2 spot-checks, plus aggregate sanity.
"""
from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=False)
from supabase import create_client  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

ANIMAL = "06875c42-292a-4094-8660-89dc905af99c"


def card_sources(cid):
    rows = sb.table("sources").select("title,url").eq("card_id", cid).execute().data
    return rows


def show(label, cid):
    c = sb.table("cards").select("name,source_count").eq("id", cid).execute().data
    if not c:
        print(f"\n{label}: CARD NOT FOUND ({cid})")
        return
    srcs = card_sources(cid)
    print(f"\n{label}: {c[0]['name']!r}  source_count={c[0]['source_count']}  rows={len(srcs)}")
    for s in srcs[:10]:
        print(f"   - {(s.get('title') or '')[:70]}")


print("=== PRIMARY: reported animal-shelter card ===")
show("ANIMAL", ANIMAL)

# A couple of named spot-checks validated earlier (find by name substring).
for needle in ("China", "cybersecurity", "Civic Tech Partnerships"):
    r = sb.table("cards").select("id,name").ilike("name", f"%{needle}%").limit(1).execute().data
    if r:
        show(f"SPOT[{needle}]", r[0]["id"])

# Aggregate sanity
print("\n=== AGGREGATE SANITY ===")
total_cards = sb.table("cards").select("id", count="exact").execute().count
empty_cards = sb.table("cards").select("id", count="exact").eq("source_count", 0).execute().count
orphan_src = sb.table("sources").select("id", count="exact").is_("card_id", "null").execute().count
repair_junc = sb.table("signal_sources").select("id", count="exact").eq(
    "created_by", "link_repair"
).execute().count
print(f"total cards            = {total_cards}")
print(f"cards source_count==0  = {empty_cards}")
print(f"orphan sources (NULL)  = {orphan_src}")
print(f"link_repair junctions  = {repair_junc}")
