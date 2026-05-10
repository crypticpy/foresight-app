/**
 * Settings tab — model/quota/research/runtime/feature overrides plus the
 * embedded cost guardrails panel and discovery preset shortcuts.
 *
 * @module pages/AdminConsole/tabs/SettingsTab
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  type AdminSetting,
  type DiscoveryPreset,
} from "../../../lib/admin-api";
import { type CostBudgetState } from "../../../lib/cost-api";
import { cn } from "../../../lib/utils";
import { formatDate, formatMoney, SectionHeader } from "../helpers";

export function SettingsTab({
  settings,
  onSave,
  onApplyPreset,
}: {
  settings: AdminSetting[];
  onSave: (setting: AdminSetting, value: unknown) => void;
  onApplyPreset: (preset: DiscoveryPreset) => Promise<void>;
}) {
  const groups = useMemo(() => {
    return settings.reduce<Record<string, AdminSetting[]>>((acc, setting) => {
      const list = acc[setting.group_name] ?? [];
      list.push(setting);
      acc[setting.group_name] = list;
      return acc;
    }, {});
  }, [settings]);

  return (
    <div>
      <SectionHeader
        title="Models & Chat Settings"
        description="Persist model, quota, research, runtime, and feature configuration overrides."
      />
      <div className="space-y-5">
        {Object.entries(groups).map(([group, items]) => (
          <div
            key={group}
            className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface"
          >
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="font-semibold capitalize text-gray-900 dark:text-white">
                {group}
              </h3>
            </div>
            {group === "discovery" && (
              <DiscoveryPresetRow onApply={onApplyPreset} />
            )}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((setting) => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  onSave={onSave}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DISCOVERY_PRESET_DESCRIPTIONS: Record<DiscoveryPreset, string> = {
  conservative:
    "Tight caps, strict thresholds. Lower spend, fewer false-positive cards.",
  balanced: "Default values used in code. Resets any drift to baseline.",
  aggressive:
    "Higher caps, looser dedup. More coverage at higher LLM cost; more enrichment + new cards.",
};

function DiscoveryPresetRow({
  onApply,
}: {
  onApply: (preset: DiscoveryPreset) => Promise<void>;
}) {
  const [pending, setPending] = useState<DiscoveryPreset | null>(null);

  const handleClick = async (preset: DiscoveryPreset) => {
    if (pending) return;
    const message =
      `Apply the "${preset}" preset? This will overwrite all eight discovery ` +
      `settings below and write one audit entry per knob.\n\n` +
      DISCOVERY_PRESET_DESCRIPTIONS[preset];
    if (!window.confirm(message)) return;
    setPending(preset);
    try {
      await onApply(preset);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-dark-surface-deep/40">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[16rem]">
          <p className="font-medium text-gray-900 dark:text-white">
            Quick presets
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Bulk-apply all eight discovery knobs. Takes effect on the next run.
          </p>
        </div>
        {(["conservative", "balanced", "aggressive"] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={pending !== null}
            onClick={() => handleClick(preset)}
            className={cn(
              "inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors",
              "border-gray-300 bg-white text-gray-700 hover:border-brand-blue hover:text-brand-blue",
              "dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200 dark:hover:border-brand-blue dark:hover:text-brand-blue",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {pending === preset && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingRow({
  setting,
  onSave,
}: {
  setting: AdminSetting;
  onSave: (setting: AdminSetting, value: unknown) => void;
}) {
  const [value, setValue] = useState(setting.value);
  useEffect(() => setValue(setting.value), [setting.value]);

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_18rem_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-gray-900 dark:text-white">
            {setting.label}
          </p>
          {setting.has_override && (
            <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue">
              override
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {setting.description}
        </p>
        <p className="mt-1 text-xs text-gray-400">Key: {setting.key}</p>
      </div>
      <div>
        {setting.value_type === "boolean" ? (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => setValue(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-blue"
            />
            {value ? "Enabled" : "Disabled"}
          </label>
        ) : (
          <input
            type={setting.value_type === "number" ? "number" : "text"}
            value={value == null ? "" : String(value)}
            onChange={(event) => {
              if (setting.value_type !== "number") {
                setValue(event.target.value);
                return;
              }
              const raw = event.target.value;
              if (raw === "") {
                setValue(null);
                return;
              }
              // Reject NaN / partial inputs ("-", "1e", ".") so they don't
              // get serialized as JSON null and silently clear the setting.
              const parsed = Number(raw);
              if (Number.isFinite(parsed)) setValue(parsed);
            }}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
          />
        )}
      </div>
      <button
        onClick={() => onSave(setting, value)}
        className="inline-flex items-center justify-center rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark-blue"
      >
        Save
      </button>
    </div>
  );
}

export function CostGuardrailsPanel({
  budget,
  onReset,
  resetting,
}: {
  budget: CostBudgetState;
  onReset: () => Promise<void> | void;
  resetting: boolean;
}) {
  const cap = budget.cap_usd;
  const alert = budget.alert_usd;
  const pct =
    cap && cap > 0 ? Math.min(100, (budget.spent_usd / cap) * 100) : 0;
  const tone = budget.tripped
    ? "border-red-500 bg-red-50 dark:bg-red-950/30"
    : budget.alerting
      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
      : "border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface";
  const barTone = budget.tripped
    ? "bg-red-500"
    : budget.alerting
      ? "bg-amber-500"
      : "bg-brand-blue";
  return (
    <div className={cn("mb-6 rounded-xl border p-5", tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Cost guardrails
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {budget.enabled
              ? `Rolling ${budget.window_days}-day window. Edit thresholds in the Models & Chat → research group.`
              : "Disabled. Enable FORESIGHT_COST_GUARDRAIL_ENABLED in settings to start blocking runaway spend."}
          </p>
        </div>
        {budget.tripped && (
          <button
            type="button"
            onClick={onReset}
            disabled={resetting}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {resetting ? "Resetting…" : "Reset guardrail"}
          </button>
        )}
      </div>
      {budget.tripped && (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
          Guardrail tripped — research, discovery, and signal-agent paths are
          refusing new work until the cap is raised or the guardrail is reset.
        </p>
      )}
      {!budget.tripped && budget.alerting && (
        <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
          Spend has crossed the soft alert threshold. A cost.alert audit row was
          recorded; new work is still allowed.
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-gray-500">Spent (window)</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatMoney(budget.spent_usd)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Hard cap</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {cap != null ? formatMoney(cap) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Alert threshold</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {alert != null ? formatMoney(alert) : "—"}
          </div>
        </div>
      </div>
      {cap != null && cap > 0 && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={cn("h-full transition-all duration-200", barTone)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {pct.toFixed(1)}% of cap · window starts{" "}
            {formatDate(budget.window_start)}
            {budget.reset_after && (
              <> · last reset {formatDate(budget.reset_after)}</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
