/**
 * Page header for WorkstreamFeed: back link, title row with status / framework
 * / view-only badges, and the action cluster (refresh, export dropdown, chat,
 * edit). Owns the export-menu open/close state — that flag lives nowhere else.
 *
 * @module pages/WorkstreamFeed/Header
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Edit,
  FileDown,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Presentation,
  RefreshCw,
} from "lucide-react";
import { FrameworkBadge } from "../../components/FrameworkBadge";
import { cn } from "../../lib/utils";
import { StatusBadge } from "./badges";
import type { Workstream } from "./types";

interface HeaderProps {
  workstream: Workstream;
  isOrgOwned: boolean;
  cardsLoading: boolean;
  exportLoading: "pdf" | "pptx" | null;
  onRefresh: () => void;
  onExport: (format: "pdf" | "pptx") => void;
  onOpenChat: () => void;
  onOpenEdit: () => void;
}

export function Header({
  workstream,
  isOrgOwned,
  cardsLoading,
  exportLoading,
  onRefresh,
  onExport,
  onOpenChat,
  onOpenEdit,
}: HeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExportClick = (format: "pdf" | "pptx") => {
    setShowExportMenu(false);
    onExport(format);
  };

  return (
    <div className="mb-8">
      <Link
        to="/workstreams"
        className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-brand-blue transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Workstreams
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold text-brand-dark-blue dark:text-white">
              {workstream.name}
            </h1>
            <StatusBadge isActive={workstream.is_active} />
            {workstream.framework_code && (
              <FrameworkBadge
                code={workstream.framework_code}
                size="sm"
                disableTooltip
              />
            )}
            {isOrgOwned && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                title="Organization-wide workstream — managed by admins. View only."
              >
                <Lock className="h-3 w-3" />
                View only
              </span>
            )}
          </div>
          {workstream.description && (
            <p className="text-gray-600 dark:text-gray-400 max-w-3xl">
              {workstream.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            title="Refresh feed"
          >
            <RefreshCw
              className={cn("h-4 w-4", cardsLoading && "animate-spin")}
            />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu((open) => !open)}
              disabled={exportLoading !== null}
              className={cn(
                "inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors",
                exportLoading !== null && "opacity-75 cursor-not-allowed",
              )}
              title="Export workstream report"
            >
              {exportLoading !== null ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              Export
              <ChevronDown
                className={cn(
                  "h-4 w-4 ml-1 transition-transform",
                  showExportMenu && "rotate-180",
                )}
              />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-dark-surface-elevated ring-1 ring-black ring-opacity-5 z-20">
                  <div className="py-1" role="menu" aria-orientation="vertical">
                    <ExportMenuItem
                      icon={<FileText className="h-5 w-5 text-red-500" />}
                      title="PDF Report"
                      subtitle="Printable document format"
                      onClick={() => handleExportClick("pdf")}
                    />
                    <ExportMenuItem
                      icon={
                        <Presentation className="h-5 w-5 text-orange-500" />
                      }
                      title="PowerPoint"
                      subtitle="Presentation slides"
                      onClick={() => handleExportClick("pptx")}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onOpenChat}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            aria-label="Open workstream chat"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          {!isOrgOwned && (
            <button
              onClick={onOpenEdit}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ExportMenuItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}

function ExportMenuItem({
  icon,
  title,
  subtitle,
  onClick,
}: ExportMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-surface-hover flex items-center gap-3 transition-colors"
      role="menuitem"
    >
      {icon}
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {subtitle}
        </div>
      </div>
    </button>
  );
}
