/**
 * Static option arrays for the Feeds page (categories, pillars, triage
 * filters). Kept as `as const` so the union types narrow at use sites.
 *
 * @module pages/Feeds/constants
 */

export const FEED_CATEGORIES = [
  { value: "gov_tech", label: "Government Tech" },
  { value: "municipal", label: "Municipal" },
  { value: "academic", label: "Academic" },
  { value: "news", label: "News" },
  { value: "think_tank", label: "Think Tank" },
  { value: "tech", label: "Technology" },
  { value: "general", label: "General" },
] as const;

export const PILLARS = [
  { value: "", label: "None" },
  { value: "CH", label: "CH - Community Health" },
  { value: "MC", label: "MC - Mobility" },
  { value: "HS", label: "HS - Housing" },
  { value: "EC", label: "EC - Economic" },
  { value: "ES", label: "ES - Environmental" },
  { value: "CE", label: "CE - Cultural" },
] as const;

export const TRIAGE_FILTERS = [
  { value: "all", label: "All Items" },
  { value: "matched", label: "Matched" },
  { value: "pending", label: "Pending" },
  { value: "irrelevant", label: "Irrelevant" },
] as const;
