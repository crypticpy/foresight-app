/**
 * WorkstreamForm — flat form layout for creating and editing workstreams.
 *
 * - EDIT mode: this flat form is the default UX.
 * - CREATE mode: WorkstreamWizard is preferred, but this form still works
 *   as a fallback (and renders the Quick-Start template grid above the
 *   fields).
 *
 * Field state, validation, preview, and submit logic live on the
 * `useWorkstreamForm` hook. This file is the layout composer.
 *
 * @module components/WorkstreamForm
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useWorkstreamForm } from "../../hooks/useWorkstreamForm";
import { getAuthToken } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { WorkstreamFrameworkPicker } from "../WorkstreamFrameworkPicker";
import { ToggleSwitch } from "../workstream/ToggleSwitch";

import { FiltersSection } from "./FiltersSection";
import { FilterPreview } from "./FilterPreview";
import { KeywordsSection } from "./KeywordsSection";
import { TemplateSection } from "./TemplateSection";

export type { Workstream, WorkstreamFormProps } from "../../types/workstream";

export function WorkstreamForm({
  workstream,
  onSuccess,
  onCancel,
  onCreatedWithZeroMatches,
}: {
  workstream?: import("../../types/workstream").Workstream;
  onSuccess: (createdId?: string, scanTriggered?: boolean) => void;
  onCancel: () => void;
  onCreatedWithZeroMatches?: (workstreamId: string) => void;
}) {
  const form = useWorkstreamForm({
    workstream,
    onSuccess,
    onCreatedWithZeroMatches,
  });

  const [frameworkToken, setFrameworkToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAuthToken().then((token) => {
      if (!cancelled) setFrameworkToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      {!form.isEditMode && (
        <TemplateSection onApplyTemplate={form.handleApplyTemplate} />
      )}

      <div>
        <label
          htmlFor="workstream-name"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-1"
        >
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="workstream-name"
          type="text"
          value={form.formData.name}
          onChange={(e) => {
            form.setFormData((prev) => ({ ...prev, name: e.target.value }));
            if (form.errors.name) {
              form.setErrors((prev) => ({ ...prev, name: undefined }));
            }
          }}
          placeholder="e.g., Smart Mobility Initiatives"
          className={cn(
            "w-full px-3 py-2 border rounded-md shadow-sm text-sm",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue",
            "dark:bg-dark-surface-elevated dark:text-white dark:placeholder-gray-400",
            form.errors.name
              ? "border-red-300 bg-red-50 dark:border-red-500 dark:bg-red-900/20"
              : "border-gray-300 bg-white dark:border-gray-600",
          )}
          aria-invalid={Boolean(form.errors.name)}
          aria-describedby={form.errors.name ? "name-error" : undefined}
        />
        {form.errors.name && (
          <p
            id="name-error"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {form.errors.name}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="workstream-description"
          className="block text-sm font-medium text-gray-900 dark:text-white mb-1"
        >
          Description
        </label>
        <textarea
          id="workstream-description"
          value={form.formData.description}
          onChange={(e) =>
            form.setFormData((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
          placeholder="Describe the focus and purpose of this workstream..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue bg-white dark:bg-dark-surface-elevated dark:text-white dark:placeholder-gray-400 resize-none"
        />
      </div>

      {frameworkToken && (
        <WorkstreamFrameworkPicker
          token={frameworkToken}
          value={{
            framework_code: form.formData.framework_code,
            framework_category_id: form.formData.framework_category_id,
            driver_ids: form.formData.driver_ids,
          }}
          onChange={form.handleFrameworkChange}
        />
      )}

      <FiltersSection form={form} />
      <KeywordsSection form={form} />

      <div className="pt-2">
        <ToggleSwitch
          checked={form.formData.is_active}
          onChange={(checked) =>
            form.setFormData((prev) => ({ ...prev, is_active: checked }))
          }
          label="Active"
          description="Active workstreams will appear in your feed and receive new signals"
        />
      </div>

      {!form.isEditMode && (
        <div className="pt-2">
          <ToggleSwitch
            checked={form.formData.analyze_now}
            onChange={(checked) =>
              form.setFormData((prev) => ({ ...prev, analyze_now: checked }))
            }
            label="Analyze Now"
            description="Immediately run AI research to find matching signals and discover new technologies based on your keywords"
          />
        </div>
      )}

      {!form.isEditMode && (
        <div className="pt-2">
          <ToggleSwitch
            checked={form.formData.auto_scan}
            onChange={(checked) =>
              form.setFormData((prev) => ({ ...prev, auto_scan: checked }))
            }
            label="Auto-scan for sources on create"
            description={
              form.formData.pillar_ids.length === 0
                ? "Recommended for topic-driven workstreams without pillars -- automatically discover relevant content sources"
                : "Automatically scan for content sources matching your workstream filters"
            }
          />
        </div>
      )}

      <FilterPreview
        form={form}
        onCreatedWithZeroMatches={onCreatedWithZeroMatches}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
        <button
          type="button"
          onClick={onCancel}
          disabled={form.isSubmitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={form.isSubmitting}
          className={cn(
            "inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors",
            form.isSubmitting
              ? "bg-brand-blue/60 cursor-not-allowed"
              : "bg-brand-blue hover:bg-brand-dark-blue",
          )}
        >
          {form.isSubmitting && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {form.isEditMode ? "Save Changes" : "Create Workstream"}
        </button>
      </div>
    </form>
  );
}

export default WorkstreamForm;
