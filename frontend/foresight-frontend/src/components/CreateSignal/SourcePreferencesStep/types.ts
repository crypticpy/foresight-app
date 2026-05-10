/**
 * Public types for the SourcePreferencesStep subtree. Re-exported from
 * the directory barrel so existing imports
 * (`{ SourcePreferences, SourcePreferencesStepProps }`) keep working.
 *
 * @module components/CreateSignal/SourcePreferencesStep/types
 */

export interface SourcePreferences {
  enabled_categories: string[];
  preferred_type: string;
  priority_domains: string[];
  custom_rss_feeds: string[];
  keywords: string[];
}

export interface SourcePreferencesStepProps {
  value: SourcePreferences;
  onChange: (prefs: SourcePreferences) => void;
}
