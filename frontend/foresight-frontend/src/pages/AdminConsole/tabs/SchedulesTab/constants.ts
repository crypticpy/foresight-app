/**
 * Pillar + category options shown in the schedule form's toggle chips.
 * Mirrors the backend `SchedulePillar` / `SourceCategory` literal unions.
 *
 * @module pages/AdminConsole/tabs/SchedulesTab/constants
 */

import {
  type SchedulePillar,
  type SourceCategory,
} from "../../../../lib/admin-api";

export const SCHEDULE_PILLARS: ReadonlyArray<{
  code: SchedulePillar;
  label: string;
}> = [
  { code: "CH", label: "Community Health" },
  { code: "EW", label: "Economic & Workforce" },
  { code: "HG", label: "High-Performing Gov" },
  { code: "HH", label: "Homelessness & Housing" },
  { code: "MC", label: "Mobility & Infrastructure" },
  { code: "PS", label: "Public Safety" },
];

export const SCHEDULE_CATEGORIES: ReadonlyArray<{
  code: SourceCategory;
  label: string;
}> = [
  { code: "rss", label: "RSS" },
  { code: "news", label: "News API" },
  { code: "academic", label: "Academic" },
  { code: "government", label: "Government" },
  { code: "tech_blog", label: "Tech blogs" },
  { code: "web_search", label: "Web search" },
];
