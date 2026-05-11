/**
 * Live API speed pill — pings `/api/v1/health` every 8s and shows the
 * round-trip latency as a "API: 47ms" chip in the hero.
 *
 * @module pages/HowItWorks/SpeedMetric
 */

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/config";
import { cn } from "../../lib/utils";

export function SpeedMetric() {
  const [ms, setMs] = useState<number | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const start = performance.now();
        const res = await fetch(`${API_BASE_URL}/api/v1/health`, {
          method: "GET",
        });
        const elapsed = Math.round(performance.now() - start);
        if (!cancelled) {
          setErr(!res.ok);
          setMs(elapsed);
        }
      } catch {
        if (!cancelled) setErr(true);
      }
    }
    ping();
    const id = setInterval(ping, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-white/90">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full animate-pulse",
          err ? "bg-amber-400" : "bg-brand-green",
        )}
      />
      API: {ms == null ? "…" : err ? "offline" : `${ms}ms`}
    </span>
  );
}
