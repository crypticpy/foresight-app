/**
 * Visual config + date/size formatters for the AssetsTab subtree.
 *
 * @module components/CardDetail/AssetsTab/constants
 */

import {
  FileSearch,
  FileText,
  type LucideIcon,
  Presentation,
} from "lucide-react";

import type { AssetType } from "./types";

type IconComponent = LucideIcon;

export const COA_COLORS = {
  logoBlue: "#44499C",
  logoGreen: "#009F4D",
  fadedWhite: "#f7f6f5",
  lightBlue: "#dcf2fd",
  lightGreen: "#dff0e3",
  darkGray: "#636262",
  pdfRed: "#DC2626",
  pdfRedBg: "#FEE2E2",
  pptxOrange: "#EA580C",
  pptxOrangeBg: "#FFEDD5",
} as const;

export const ASSET_TYPE_CONFIG: Record<
  AssetType,
  {
    icon: IconComponent;
    label: string;
    color: string;
    bgColor: string;
  }
> = {
  brief: {
    icon: FileText,
    label: "Executive Brief",
    color: COA_COLORS.logoBlue,
    bgColor: COA_COLORS.lightBlue,
  },
  research: {
    icon: FileSearch,
    label: "Deep Research",
    color: COA_COLORS.logoGreen,
    bgColor: COA_COLORS.lightGreen,
  },
  pdf_export: {
    icon: FileText,
    label: "PDF Export",
    color: COA_COLORS.pdfRed,
    bgColor: COA_COLORS.pdfRedBg,
  },
  pptx_export: {
    icon: Presentation,
    label: "PowerPoint",
    color: COA_COLORS.pptxOrange,
    bgColor: COA_COLORS.pptxOrangeBg,
  },
};

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export function formatTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
