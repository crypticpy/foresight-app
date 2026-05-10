import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { listActivity, type ActivityEvent } from "../../lib/activity-api";

interface ActivityRailProps {
  workstreamId: string;
  open: boolean;
  onClose: () => void;
}

export function ActivityRail({ workstreamId, open, onClose }: ActivityRailProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      listActivity(token, workstreamId).then(setEvents).catch(() => setEvents([]));
    });
  }, [open, workstreamId]);

  if (!open) return null;

  return (
    <aside className="fixed right-0 top-16 z-40 h-[calc(100vh-4rem)] w-full max-w-md border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Activity
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close activity"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {events.map((event) => (
          <div key={event.id} className="px-5 py-3">
            <p className="text-sm text-slate-800 dark:text-slate-100">
              <span className="font-medium">
                {event.actor_display_name || "Someone"}
              </span>{" "}
              {event.action.replace(".", " ")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(event.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {events.length === 0 && (
          <p className="px-5 py-6 text-sm text-slate-500">No activity yet.</p>
        )}
      </div>
    </aside>
  );
}
