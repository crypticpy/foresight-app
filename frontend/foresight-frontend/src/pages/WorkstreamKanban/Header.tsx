/**
 * Page header for the kanban board: back link, title row with status /
 * framework / lock / role badges, and the right-hand cluster of action
 * buttons (scan, auto-populate, refresh, share, members, activity, export
 * dropdown, portfolios, chat, edit filters). The cluster respects the
 * caller's capabilities — read-only viewers see only the read affordances.
 *
 * @module pages/WorkstreamKanban/Header
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  ChevronDown,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  Plus,
  Presentation,
  Radar,
  RefreshCw,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { FrameworkBadge } from "../../components/FrameworkBadge";
import { RoleBadge } from "../../components/collaboration/RoleBadge";
import type { Workstream } from "../../components/WorkstreamForm";
import { StatusBadge } from "./badges";

interface KanbanHeaderProps {
  workstream: Workstream;
  canEditBoard: boolean;
  canManage: boolean;
  canRunResearch: boolean;
  canExport: boolean;
  scanning: boolean;
  autoPopulating: boolean;
  refreshing: boolean;
  cardsLoading: boolean;
  exportLoading: "pdf" | "pptx" | null;
  onStartScan: () => void;
  onAutoPopulate: () => void;
  onRefresh: () => void;
  onOpenShare: () => void;
  onOpenMembers: () => void;
  onOpenActivity: () => void;
  onExport: (format: "pdf" | "pptx") => void;
  workstreamId: string;
  onOpenChat: () => void;
  onOpenDiscussion: () => void;
  onOpenEdit: () => void;
}

export function KanbanHeader({
  workstream,
  canEditBoard,
  canManage,
  canRunResearch,
  canExport,
  scanning,
  autoPopulating,
  refreshing,
  cardsLoading,
  exportLoading,
  onStartScan,
  onAutoPopulate,
  onRefresh,
  onOpenShare,
  onOpenMembers,
  onOpenActivity,
  onExport,
  workstreamId,
  onOpenChat,
  onOpenDiscussion,
  onOpenEdit,
}: KanbanHeaderProps) {
  const isOrgOwned = workstream.owner_type === "org";

  return (
    <div className="mb-6">
      <Link
        to="/workstreams"
        className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-brand-blue transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Workstreams
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-2 flex-wrap">
            <h1 className="min-w-0 max-w-full flex-[1_1_24rem] text-2xl md:text-3xl font-bold leading-tight text-brand-dark-blue dark:text-white break-words">
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
            <RoleBadge role={workstream.role} />
          </div>
          {workstream.description && (
            <p className="text-gray-600 dark:text-gray-400 max-w-3xl">
              {workstream.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canEditBoard && canRunResearch && (
            <PrimaryActionButton
              onClick={onStartScan}
              busy={scanning}
              busyLabel="Scanning..."
              idleLabel="Scan for Updates"
              idleIcon={<Radar className="h-4 w-4 mr-2" />}
              tone="blue"
              title="Scan web sources for new content matching this workstream (2/day limit)"
            />
          )}

          {canEditBoard && (
            <PrimaryActionButton
              onClick={onAutoPopulate}
              busy={autoPopulating}
              busyLabel="Auto-populate"
              idleLabel="Auto-populate"
              idleIcon={<Plus className="h-4 w-4 mr-2" />}
              tone="green"
              title="Find and add matching cards from existing database"
            />
          )}

          <button
            onClick={onRefresh}
            disabled={refreshing || cardsLoading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            title="Refresh cards"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (refreshing || cardsLoading) && "animate-spin",
              )}
            />
          </button>

          {canManage && (
            <SecondaryActionButton
              onClick={onOpenShare}
              icon={<Share2 className="h-4 w-4" />}
              label="Share"
            />
          )}
          <SecondaryActionButton
            onClick={onOpenMembers}
            icon={<Users className="h-4 w-4" />}
            label="Members"
          />
          <SecondaryActionButton
            onClick={onOpenActivity}
            icon={<ListChecks className="h-4 w-4" />}
            label="Activity"
          />

          {canExport && (
            <ExportDropdown exportLoading={exportLoading} onExport={onExport} />
          )}

          <Link
            to={`/workstreams/${workstreamId}/portfolios`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            aria-label="View portfolios"
          >
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Portfolios</span>
          </Link>

          <button
            onClick={onOpenChat}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            aria-label="Open workstream chat"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          <button
            onClick={onOpenDiscussion}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
            aria-label="Open workstream discussion"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Discussion</span>
          </button>

          {canManage && (
            <button
              onClick={onOpenEdit}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
              title="Edit workstream filters"
            >
              <Settings className="h-4 w-4 mr-2" />
              Edit Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<"blue" | "green", string> = {
  blue: "bg-brand-blue hover:bg-blue-700 focus:ring-brand-blue",
  green: "bg-brand-green hover:bg-green-600 focus:ring-brand-green",
};

interface PrimaryActionButtonProps {
  onClick: () => void;
  busy: boolean;
  busyLabel: string;
  idleLabel: string;
  idleIcon: React.ReactNode;
  tone: "blue" | "green";
  title?: string;
}

function PrimaryActionButton({
  onClick,
  busy,
  busyLabel,
  idleLabel,
  idleIcon,
  tone,
  title,
}: PrimaryActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-surface transition-colors",
        TONE_CLASSES[tone],
        busy && "opacity-75 cursor-not-allowed",
      )}
      title={title}
    >
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : idleIcon}
      {busy ? busyLabel : idleLabel}
    </button>
  );
}

interface SecondaryActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function SecondaryActionButton({
  onClick,
  icon,
  label,
}: SecondaryActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

interface ExportDropdownProps {
  exportLoading: "pdf" | "pptx" | null;
  onExport: (format: "pdf" | "pptx") => void;
}

function ExportDropdown({ exportLoading, onExport }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);

  const handle = (format: "pdf" | "pptx") => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={exportLoading !== null}
        className={cn(
          "inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-surface-elevated hover:bg-gray-50 dark:hover:bg-dark-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors",
          exportLoading !== null && "opacity-75 cursor-not-allowed",
        )}
        title="Export workstream report"
      >
        {exportLoading !== null ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Export
        <ChevronDown
          className={cn(
            "h-4 w-4 ml-1 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-dark-surface-elevated ring-1 ring-black ring-opacity-5 z-20">
            <div className="py-1" role="menu" aria-orientation="vertical">
              <ExportMenuItem
                onClick={() => handle("pdf")}
                icon={<FileText className="h-5 w-5 text-red-500" />}
                title="PDF Report"
                description="Printable document format"
              />
              <ExportMenuItem
                onClick={() => handle("pptx")}
                icon={<Presentation className="h-5 w-5 text-orange-500" />}
                title="PowerPoint"
                description="Presentation slides"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ExportMenuItemProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function ExportMenuItem({
  onClick,
  icon,
  title,
  description,
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
          {description}
        </div>
      </div>
    </button>
  );
}
