import { useEffect, useState } from "react";

import { fetchCostStatus } from "../lib/admin-api";
import { supabase } from "../App";

const POLL_INTERVAL_MS = 60_000;

export function CostStatusBanner() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (!cancelled) setPaused(false);
          return;
        }
        const status = await fetchCostStatus(token);
        if (!cancelled) setPaused(Boolean(status.paused));
      } catch {
        // Silently treat fetch failure as "not paused" — better than blocking
        // the whole UI behind a flaky network call.
        if (!cancelled) setPaused(false);
      }
    };

    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!paused) return null;

  return (
    <div
      role="status"
      className="border-b border-red-300 bg-red-100 px-4 py-2 text-center text-sm font-medium text-red-900 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100"
    >
      Research is temporarily paused while an administrator reviews recent
      spend. Discovery, deep research, and signal generation will resume once
      the cost guardrail is reset.
    </div>
  );
}
