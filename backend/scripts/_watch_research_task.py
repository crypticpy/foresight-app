"""Watch a single research_task row: status + latest job_events row.

Liveness is now carried by the ``job_events`` table (PR introducing the
job_events substrate). The legacy ``result_summary.heartbeat_at`` field
is no longer written; this script reads from ``job_events`` instead.
"""

import os
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
TASK_ID = sys.argv[1] if len(sys.argv) > 1 else "4b770f63-e1ae-4511-af81-261d7f8dce44"

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

while True:
    r = (
        sb.table("research_tasks")
        .select(
            "id, status, started_at, completed_at, result_summary, error_message"
        )
        .eq("id", TASK_ID)
        .execute()
    )
    if not r.data:
        print(f"task {TASK_ID} not found", flush=True)
        break
    row = r.data[0]

    ev = (
        sb.table("job_events")
        .select("event_type, stage, message, created_at")
        .eq("job_id", TASK_ID)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    last_event = ev.data[0] if ev.data else None
    last_stage = last_event.get("stage") if last_event else None
    last_event_type = last_event.get("event_type") if last_event else None
    last_event_at = last_event.get("created_at") if last_event else None
    age_s = None
    if last_event_at:
        try:
            dt = datetime.fromisoformat(last_event_at.replace("Z", "+00:00"))
            age_s = (datetime.now(timezone.utc) - dt).total_seconds()
        except Exception:
            pass

    ts = time.strftime("%H:%M:%S")
    age_str = f"{age_s:.0f}s" if age_s is not None else "n/a"
    print(
        f"[{ts}] status={row['status']} stage={last_stage} "
        f"event={last_event_type} age={age_str}",
        flush=True,
    )

    if row["status"] in ("completed", "failed"):
        print("FINAL:", row, flush=True)
        break
    if age_s is not None and age_s > 240:
        print(
            f"EVENTS STALE ({age_s:.0f}s) — watchdog should fire at ~180s",
            flush=True,
        )
    time.sleep(20)
