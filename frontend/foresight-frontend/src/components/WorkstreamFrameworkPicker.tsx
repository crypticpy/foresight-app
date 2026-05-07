/**
 * WorkstreamFrameworkPicker
 *
 * Three-stage selector for scoping a workstream to a strategic framework:
 *
 *   1. Pick a framework (e.g. "PPP").
 *   2. Pick a category inside that framework (e.g. "people").
 *   3. Multi-select one or more drivers inside that category.
 *
 * Surfaces the selected scope through `onChange`.  Designed to live inside
 * the WorkstreamForm / WorkstreamWizard "focus" step but kept standalone
 * so it can also be reused in admin / template flows.
 *
 * Loads framework data lazily on mount; the call is small (one framework
 * + nested categories/drivers) and cheap to repeat.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { FrameworkBadge } from "./FrameworkBadge";
import { DriverChip } from "./DriverChip";
import {
  listFrameworks,
  getFramework,
  type StrategicFramework,
  type StrategicFrameworkSummary,
} from "../lib/frameworks-api";

export interface WorkstreamFrameworkPickerValue {
  framework_code: string | null;
  framework_category_id: string | null;
  driver_ids: string[];
}

export interface WorkstreamFrameworkPickerProps {
  /** Auth token to call /api/v1/frameworks. */
  token: string;
  /** Current selection. */
  value: WorkstreamFrameworkPickerValue;
  /** Called whenever the selection changes. */
  onChange: (next: WorkstreamFrameworkPickerValue) => void;
  /** Optional className for the outer container. */
  className?: string;
}

export function WorkstreamFrameworkPicker({
  token,
  value,
  onChange,
  className,
}: WorkstreamFrameworkPickerProps) {
  const [frameworks, setFrameworks] = useState<StrategicFrameworkSummary[]>([]);
  const [loadingFrameworks, setLoadingFrameworks] = useState(true);
  const [framework, setFramework] = useState<StrategicFramework | null>(null);
  const [loadingFramework, setLoadingFramework] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Stage 1: load framework summaries -----------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoadingFrameworks(true);
    setError(null);
    listFrameworks(token)
      .then((rows) => {
        if (cancelled) return;
        setFrameworks(rows);
        // Auto-select if exactly one framework exists and nothing is selected.
        const sole = rows[0];
        if (!value.framework_code && rows.length === 1 && sole) {
          onChange({
            ...value,
            framework_code: sole.code,
          });
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load frameworks",
          );
      })
      .finally(() => {
        if (!cancelled) setLoadingFrameworks(false);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally only re-run when the token changes — value/onChange
    // would otherwise loop via the auto-select branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---- Stage 2: load nested framework when code changes --------------------
  useEffect(() => {
    if (!value.framework_code) {
      setFramework(null);
      return;
    }
    let cancelled = false;
    setLoadingFramework(true);
    setError(null);
    getFramework(token, value.framework_code)
      .then((data) => {
        if (!cancelled) setFramework(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load framework",
          );
      })
      .finally(() => {
        if (!cancelled) setLoadingFramework(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, value.framework_code]);

  const selectedCategory = useMemo(() => {
    if (!framework || !value.framework_category_id) return null;
    return (
      framework.categories.find((c) => c.id === value.framework_category_id) ??
      null
    );
  }, [framework, value.framework_category_id]);

  // ---- Handlers ------------------------------------------------------------
  const selectFramework = (code: string) => {
    onChange({
      framework_code: code,
      framework_category_id: null,
      driver_ids: [],
    });
  };

  const selectCategory = (categoryId: string) => {
    onChange({
      ...value,
      framework_category_id: categoryId,
      driver_ids: [],
    });
  };

  const toggleDriver = (driverId: string) => {
    const next = value.driver_ids.includes(driverId)
      ? value.driver_ids.filter((id) => id !== driverId)
      : [...value.driver_ids, driverId];
    onChange({ ...value, driver_ids: next });
  };

  const selectAllDrivers = () => {
    if (!selectedCategory) return;
    onChange({
      ...value,
      driver_ids: selectedCategory.drivers.map((d) => d.id),
    });
  };

  const clearDrivers = () => {
    onChange({ ...value, driver_ids: [] });
  };

  // ---- Render --------------------------------------------------------------
  if (loadingFrameworks) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading frameworks…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 p-3 text-sm text-red-700 dark:text-red-300",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  if (frameworks.length === 0) {
    return (
      <div
        className={cn(
          "text-sm text-gray-600 dark:text-gray-400 italic",
          className,
        )}
      >
        No strategic frameworks have been configured yet.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* Stage 1: frameworks */}
      <section>
        <header className="mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Strategic framework
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Anchor this workstream to a city framework so signals can roll up to
            the right pillar.
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          {frameworks.map((f) => {
            const isSelected = value.framework_code === f.code;
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => selectFramework(f.code)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-200",
                  isSelected
                    ? "border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/20"
                    : "border-gray-200 bg-white hover:border-brand-blue/60 dark:bg-dark-surface dark:border-gray-700",
                )}
                aria-pressed={isSelected}
              >
                <FrameworkBadge
                  code={f.code}
                  name={f.name}
                  description={f.description}
                  size="sm"
                  disableTooltip
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Stage 2: categories */}
      {value.framework_code && (
        <section>
          <header className="mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Pillar
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pick the category within {value.framework_code} this workstream
              tracks.
            </p>
          </header>
          {loadingFramework ? (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading categories…</span>
            </div>
          ) : framework && framework.categories.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {framework.categories.map((c) => {
                const isSelected = value.framework_category_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCategory(c.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors duration-200",
                      isSelected
                        ? "border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/20"
                        : "border-gray-200 bg-white hover:border-brand-blue/60 dark:bg-dark-surface dark:border-gray-700",
                    )}
                    aria-pressed={isSelected}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {c.name}
                    </div>
                    {c.description && (
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {c.description}
                      </div>
                    )}
                    <div className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                      {c.drivers.length} driver
                      {c.drivers.length === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-sm italic text-gray-500 dark:text-gray-400">
              This framework has no categories defined.
            </div>
          )}
        </section>
      )}

      {/* Stage 3: drivers */}
      {selectedCategory && (
        <section>
          <header className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Drivers
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Select the drivers this workstream will track. Hover for the
                metrics each driver covers.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllDrivers}
                className="text-brand-blue hover:underline disabled:opacity-50"
                disabled={
                  selectedCategory.drivers.length === 0 ||
                  selectedCategory.drivers.every((d) =>
                    value.driver_ids.includes(d.id),
                  )
                }
              >
                Select all
              </button>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <button
                type="button"
                onClick={clearDrivers}
                className="text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
                disabled={value.driver_ids.length === 0}
              >
                Clear
              </button>
            </div>
          </header>
          {selectedCategory.drivers.length === 0 ? (
            <div className="text-sm italic text-gray-500 dark:text-gray-400">
              No drivers in this category yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedCategory.drivers.map((d) => (
                <DriverChip
                  key={d.id}
                  name={d.name}
                  description={d.description}
                  selected={value.driver_ids.includes(d.id)}
                  onClick={() => toggleDriver(d.id)}
                  size="sm"
                />
              ))}
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {value.driver_ids.length} driver
            {value.driver_ids.length === 1 ? "" : "s"} selected
          </div>
        </section>
      )}
    </div>
  );
}

export default WorkstreamFrameworkPicker;
