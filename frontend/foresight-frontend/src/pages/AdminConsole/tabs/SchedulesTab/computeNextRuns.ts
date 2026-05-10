/**
 * Compute the next N firing times so operators can sanity-check the schedule
 * before saving. Uses the same precedence the backend's scheduler does:
 * next_run_at if present, otherwise last_run_at + interval, otherwise now.
 *
 * @module pages/AdminConsole/tabs/SchedulesTab/computeNextRuns
 */

export function computeNextRuns(
  schedule: {
    interval_hours?: number | null;
    next_run_at?: string | null;
    last_run_at?: string | null;
  },
  count = 5,
): Date[] {
  const interval = Math.max(1, Math.round(schedule.interval_hours ?? 24));
  const ms = interval * 60 * 60 * 1000;
  let anchor: Date;
  if (schedule.next_run_at) {
    anchor = new Date(schedule.next_run_at);
  } else if (schedule.last_run_at) {
    anchor = new Date(new Date(schedule.last_run_at).getTime() + ms);
  } else {
    anchor = new Date(Date.now() + ms);
  }
  if (Number.isNaN(anchor.getTime())) anchor = new Date(Date.now() + ms);
  // Roll forward if the anchor is in the past so the preview always shows
  // future fires — operators care about "what's next," not "what was missed."
  const now = Date.now();
  while (anchor.getTime() <= now) {
    anchor = new Date(anchor.getTime() + ms);
  }
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(anchor.getTime() + i * ms));
  }
  return out;
}
