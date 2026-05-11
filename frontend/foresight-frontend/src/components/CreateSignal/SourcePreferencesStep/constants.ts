/**
 * Static option lists for the wizard's source-preferences step:
 * categories users can toggle on/off, and the single-select preferred
 * content type.
 *
 * @module components/CreateSignal/SourcePreferencesStep/constants
 */

import type React from "react";
import { Cpu, GraduationCap, Landmark, Newspaper, Rss } from "lucide-react";

export interface CategoryConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  subtitle: string;
}

export const SOURCE_CATEGORIES: CategoryConfig[] = [
  {
    id: "news",
    label: "News",
    icon: Newspaper,
    subtitle: "Reuters, AP, GCN, GovTech, StateScoop",
  },
  {
    id: "academic",
    label: "Academic",
    icon: GraduationCap,
    subtitle: "arXiv -- AI, ML, Computers & Society",
  },
  {
    id: "government",
    label: "Government",
    icon: Landmark,
    subtitle: ".gov -- GSA, NIST, Census, HUD, DOT, EPA, FCC",
  },
  {
    id: "tech_blog",
    label: "Tech Blogs",
    icon: Cpu,
    subtitle: "TechCrunch, Ars Technica, Wired",
  },
  {
    id: "rss",
    label: "RSS Feeds",
    icon: Rss,
    subtitle: "Custom feeds you configure below",
  },
];

export interface SourceTypeOption {
  value: string;
  label: string;
}

export const SOURCE_TYPE_OPTIONS: SourceTypeOption[] = [
  { value: "news", label: "News articles" },
  { value: "blogs", label: "Blog posts" },
  { value: "academic", label: "Academic papers" },
  { value: "federal", label: "Federal/government reports" },
  { value: "pdf", label: "PDF documents" },
];
