/**
 * Quick-start template grid rendered above the form in CREATE mode.
 * Tapping a card pre-fills the form via `useWorkstreamForm`.
 *
 * @module components/WorkstreamForm/TemplateSection
 */

import type { WorkstreamTemplate } from "../../types/workstream";
import { TemplateCard } from "../workstream/TemplateCard";
import { WORKSTREAM_TEMPLATES } from "../workstream/steps/StepStart";

export interface TemplateSectionProps {
  onApplyTemplate: (template: WorkstreamTemplate) => void;
}

export function TemplateSection({ onApplyTemplate }: TemplateSectionProps) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
          Quick Start Templates
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Choose a template to pre-fill the form, or start from scratch below
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {WORKSTREAM_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={onApplyTemplate}
          />
        ))}
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white dark:bg-dark-surface px-2 text-gray-500 dark:text-gray-400">
            or customize your own
          </span>
        </div>
      </div>
    </div>
  );
}
