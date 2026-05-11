/**
 * SourcePreferencesStep — step 2 of the Create Signal wizard. Lets the
 * user configure which source categories to search, which content type
 * to prioritize, and pinned domains / RSS feeds / monitoring keywords.
 *
 * @module components/CreateSignal/SourcePreferencesStep
 */

import { useCallback } from "react";
import { Globe, Link as LinkIcon, Tag } from "lucide-react";

import { CategoryToggleList } from "./CategoryToggleList";
import { SourceTypeRadio } from "./SourceTypeRadio";
import { TagInput } from "./TagInput";
import type { SourcePreferences, SourcePreferencesStepProps } from "./types";

export type { SourcePreferences, SourcePreferencesStepProps } from "./types";

export function SourcePreferencesStep({
  value,
  onChange,
}: SourcePreferencesStepProps) {
  const update = useCallback(
    (patch: Partial<SourcePreferences>) => {
      onChange({ ...value, ...patch });
    },
    [value, onChange],
  );

  const handleToggleCategory = useCallback(
    (categoryId: string) => {
      const updated = value.enabled_categories.includes(categoryId)
        ? value.enabled_categories.filter((c) => c !== categoryId)
        : [...value.enabled_categories, categoryId];
      update({ enabled_categories: updated });
    },
    [value.enabled_categories, update],
  );

  const handleSetPreferredType = useCallback(
    (type: string) => update({ preferred_type: type }),
    [update],
  );

  const handleAddDomain = useCallback(
    (domain: string) =>
      update({ priority_domains: [...value.priority_domains, domain] }),
    [value.priority_domains, update],
  );

  const handleRemoveDomain = useCallback(
    (domain: string) =>
      update({
        priority_domains: value.priority_domains.filter((d) => d !== domain),
      }),
    [value.priority_domains, update],
  );

  const handleAddRssFeed = useCallback(
    (url: string) =>
      update({ custom_rss_feeds: [...value.custom_rss_feeds, url] }),
    [value.custom_rss_feeds, update],
  );

  const handleRemoveRssFeed = useCallback(
    (url: string) =>
      update({
        custom_rss_feeds: value.custom_rss_feeds.filter((u) => u !== url),
      }),
    [value.custom_rss_feeds, update],
  );

  const handleAddKeyword = useCallback(
    (keyword: string) => update({ keywords: [...value.keywords, keyword] }),
    [value.keywords, update],
  );

  const handleRemoveKeyword = useCallback(
    (keyword: string) =>
      update({ keywords: value.keywords.filter((k) => k !== keyword) }),
    [value.keywords, update],
  );

  const validateRssUrl = useCallback((url: string): string | null => {
    if (!/^https?:\/\/.+/i.test(url)) {
      return "URL must start with http:// or https://";
    }
    return null;
  }, []);

  return (
    <div className="space-y-6">
      <CategoryToggleList
        enabled={value.enabled_categories}
        onToggle={handleToggleCategory}
      />

      <SourceTypeRadio
        value={value.preferred_type}
        onChange={handleSetPreferredType}
      />

      <TagInput
        label="Priority Domains"
        items={value.priority_domains}
        onAdd={handleAddDomain}
        onRemove={handleRemoveDomain}
        placeholder="e.g., gartner.com, mckinsey.com"
        icon={Globe}
        maxItems={20}
      />

      <TagInput
        label="Custom RSS Feeds"
        items={value.custom_rss_feeds}
        onAdd={handleAddRssFeed}
        onRemove={handleRemoveRssFeed}
        placeholder="https://example.com/feed.xml"
        icon={LinkIcon}
        validate={validateRssUrl}
        maxItems={10}
      />

      <TagInput
        label="Keywords"
        items={value.keywords}
        onAdd={handleAddKeyword}
        onRemove={handleRemoveKeyword}
        placeholder="e.g., smart city, digital twin"
        icon={Tag}
        maxItems={30}
      />
    </div>
  );
}

export default SourcePreferencesStep;
