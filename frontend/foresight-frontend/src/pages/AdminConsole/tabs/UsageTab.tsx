/**
 * Usage tab — LLM + external API consumption summary with a window
 * selector and a per-model/per-operation breakdown. Embeds the cost
 * guardrails panel at the top so admins can intervene from one place.
 *
 * @module pages/AdminConsole/tabs/UsageTab
 */

import { BarChart3, Bot, Database } from "lucide-react";

import { type UsageEvent, type UsageSummary } from "../../../lib/admin-api";
import { type CostBudgetState } from "../../../lib/cost-api";
import { formatDate, formatMoney, MetricCard, SectionHeader } from "../helpers";
import { CostGuardrailsPanel } from "./SettingsTab";

export function UsageTab({
  usage,
  recentUsage,
  days,
  onDaysChange,
  budget,
  onResetGuardrail,
  resetting,
}: {
  usage: UsageSummary | null;
  recentUsage: UsageEvent[];
  days: number;
  onDaysChange: (days: number) => void;
  budget: CostBudgetState | null;
  onResetGuardrail: () => Promise<void> | void;
  resetting: boolean;
}) {
  return (
    <div>
      <SectionHeader
        title="Usage"
        description="Monitor model and external API consumption for the selected window."
        action={
          <select
            value={days}
            onChange={(event) => onDaysChange(Number(event.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-white"
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />
      {budget && (
        <CostGuardrailsPanel
          budget={budget}
          onReset={onResetGuardrail}
          resetting={resetting}
        />
      )}
      {usage && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              label="LLM Calls"
              value={usage.llm_totals.calls}
              subtext={`${usage.llm_totals.total_tokens.toLocaleString()} tokens`}
              icon={Bot}
            />
            <MetricCard
              label="LLM Cost"
              value={formatMoney(usage.llm_totals.estimated_cost_usd)}
              subtext={`${usage.llm_totals.cached_input_tokens.toLocaleString()} cached input tokens`}
              icon={BarChart3}
            />
            <MetricCard
              label="External APIs"
              value={usage.external_api_totals.calls}
              subtext={formatMoney(
                usage.external_api_totals.estimated_cost_usd,
              )}
              icon={Database}
            />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownTable title="By Model" rows={usage.llm_by_model} />
            <BreakdownTable
              title="By Operation"
              rows={usage.llm_by_operation}
            />
          </div>
        </>
      )}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Recent LLM Events
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentUsage.map((event, index) => (
                <tr key={event.id || index}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {event.operation || "unknown"}
                    </div>
                    <div className="text-xs text-gray-500">{event.model}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {Number(event.total_tokens || 0).toLocaleString()} tokens
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatMoney(Number(event.estimated_cost_usd || 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatDate(event.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, Record<string, number>>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-surface">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
      </div>
      <table className="min-w-full text-sm">
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {Object.entries(rows).map(([name, values]) => (
            <tr key={name}>
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {name}
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {Number(values.calls || 0).toLocaleString()} calls
              </td>
              <td className="px-4 py-3 text-right text-gray-500">
                {formatMoney(values.estimated_cost_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
