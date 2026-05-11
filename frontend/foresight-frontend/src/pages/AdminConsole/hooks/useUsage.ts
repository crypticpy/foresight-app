/**
 * Usage telemetry hook — windowed summary, recent events tail, and the
 * cost-budget snapshot. Refetches whenever the window (`days`) changes so
 * `loadAll` can stay light and not re-pull windowed data on every console
 * boot.
 *
 * @module pages/AdminConsole/hooks/useUsage
 */

import { useCallback, useEffect, useState } from "react";

import {
  fetchRecentUsage,
  fetchUsageSummary,
  type UsageEvent,
  type UsageSummary,
} from "../../../lib/admin-api";
import {
  fetchCostBudget,
  resetCostGuardrail,
  type CostBudgetState,
} from "../../../lib/cost-api";
import { getToken } from "../helpers";

export function useUsage({
  isAdmin,
  onError,
  onNotice,
}: {
  isAdmin: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [recent, setRecent] = useState<UsageEvent[]>([]);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState<CostBudgetState | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const [usageData, recentData, budgetData] = await Promise.all([
        fetchUsageSummary(token, days),
        fetchRecentUsage(token, 50),
        fetchCostBudget(token).catch(() => null),
      ]);
      setUsage(usageData);
      setRecent(recentData);
      setBudget(budgetData);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load usage");
    }
  }, [days, onError]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Just update `days` — the load effect picks up the change and refetches once.
  const updateWindow = useCallback((next: number) => {
    setDays(next);
  }, []);

  const refreshBudget = useCallback(async () => {
    try {
      const token = await getToken();
      setBudget(await fetchCostBudget(token));
    } catch {
      // Leave the panel showing the previous snapshot.
    }
  }, []);

  const resetGuardrail = useCallback(async () => {
    setResetting(true);
    try {
      const token = await getToken();
      const updated = await resetCostGuardrail(token);
      setBudget(updated);
      onNotice("Cost guardrail reset.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to reset guardrail");
    } finally {
      setResetting(false);
    }
  }, [onError, onNotice]);

  return {
    usage,
    recent,
    days,
    budget,
    resetting,
    load,
    updateWindow,
    refreshBudget,
    resetGuardrail,
  };
}
