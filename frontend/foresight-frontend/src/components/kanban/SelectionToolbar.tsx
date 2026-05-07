/**
 * SelectionToolbar
 *
 * Action bar that mounts when one or more kanban cards are selected. Wires
 * the user's bulk-action choices to `bulkWorkstreamCardAction()` and clears
 * selection on success. Email / share-link actions hand off to the user's
 * mail client via `mailto:` and clipboard.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  Eye,
  EyeOff,
  Mail,
  Link2,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  bulkWorkstreamCardAction,
  type BulkCardAction,
  type BulkCardActionResponse,
} from "../../lib/workstream-api";
import { SavePortfolioModal } from "../portfolios/SavePortfolioModal";

export interface SelectionToolbarProps {
  workstreamId: string;
  selectedCardIds: string[];
  getAuthToken: () => Promise<string | null>;
  showToast: (type: "success" | "error" | "info", message: string) => void;
  /** Clear the parent's selection set after a successful action. */
  onClearSelection: () => void;
  /**
   * Notify the parent that one or more cards changed so it can refresh
   * card state (e.g. archive moves cards into the archived column).
   */
  onCardsChanged?: () => void | Promise<void>;
  className?: string;
}

type PendingAction =
  | "archive"
  | "restore"
  | "watch"
  | "unwatch"
  | "copy_share_links"
  | "email_selection"
  | null;

export function SelectionToolbar({
  workstreamId,
  selectedCardIds,
  getAuthToken,
  showToast,
  onClearSelection,
  onCardsChanged,
  className,
}: SelectionToolbarProps) {
  const [pending, setPending] = useState<PendingAction>(null);
  const count = selectedCardIds.length;

  const runBulk = useCallback(
    async (
      action: BulkCardAction,
      pendingKey: PendingAction,
      params?: Record<string, unknown>,
    ): Promise<BulkCardActionResponse | null> => {
      if (count === 0) return null;
      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return null;
      }
      setPending(pendingKey);
      try {
        const res = await bulkWorkstreamCardAction(
          token,
          workstreamId,
          action,
          selectedCardIds,
          params,
        );
        return res;
      } catch (err) {
        console.error(`Bulk ${action} failed:`, err);
        showToast("error", `Bulk ${action.replace("_", " ")} failed`);
        return null;
      } finally {
        setPending(null);
      }
    },
    [count, getAuthToken, selectedCardIds, showToast, workstreamId],
  );

  const handleArchive = useCallback(async () => {
    const res = await runBulk("archive", "archive");
    if (res) {
      showToast("success", `Archived ${res.updated ?? count} card(s)`);
      onClearSelection();
      await onCardsChanged?.();
    }
  }, [runBulk, showToast, count, onClearSelection, onCardsChanged]);

  const handleRestore = useCallback(async () => {
    const res = await runBulk("restore", "restore");
    if (res) {
      showToast("success", `Restored ${res.updated ?? count} card(s) to inbox`);
      onClearSelection();
      await onCardsChanged?.();
    }
  }, [runBulk, showToast, count, onClearSelection, onCardsChanged]);

  const handleWatch = useCallback(async () => {
    const res = await runBulk("watch", "watch");
    if (res) {
      showToast("success", `Now watching ${res.updated ?? count} card(s)`);
      onClearSelection();
      await onCardsChanged?.();
    }
  }, [runBulk, showToast, count, onClearSelection, onCardsChanged]);

  const handleUnwatch = useCallback(async () => {
    const res = await runBulk("unwatch", "unwatch");
    if (res) {
      showToast("success", `Stopped watching ${res.updated ?? count} card(s)`);
      onClearSelection();
      await onCardsChanged?.();
    }
  }, [runBulk, showToast, count, onClearSelection, onCardsChanged]);

  const handleCopyLinks = useCallback(async () => {
    const res = await runBulk("copy_share_links", "copy_share_links", {
      frontend_url: window.location.origin,
    });
    if (!res) return;
    const urls = res.urls ?? [];
    if (urls.length === 0) {
      showToast("info", "No shareable links produced");
      return;
    }
    try {
      await navigator.clipboard.writeText(urls.join("\n"));
      showToast("success", `Copied ${urls.length} link(s) to clipboard`);
    } catch (err) {
      console.error("clipboard write failed:", err);
      showToast("error", "Could not write to clipboard");
    }
  }, [runBulk, showToast]);

  const handleEmail = useCallback(async () => {
    const origin = window.location.origin;
    const res = await runBulk("email_selection", "email_selection", {
      frontend_url: origin,
    });
    if (!res) return;
    const subject = encodeURIComponent(res.subject ?? "Foresight signals");
    const body = encodeURIComponent(res.body ?? "");
    const href = `mailto:?subject=${subject}&body=${body}`;
    window.location.href = href;
    showToast("success", "Opened your email client");
  }, [runBulk, showToast]);

  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleOpenPortfolioModal = useCallback(() => {
    if (count === 0) return;
    setPortfolioModalOpen(true);
  }, [count]);

  if (count === 0) return null;

  const isPending = (key: PendingAction) => pending === key;
  const anyPending = pending !== null;

  return (
    <div
      className={cn(
        "sticky top-2 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-blue/30 bg-white/95 dark:bg-dark-surface-elevated/95 backdrop-blur px-4 py-2 shadow-md",
        className,
      )}
      role="toolbar"
      aria-label="Bulk actions for selected cards"
    >
      <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-blue px-2 text-xs text-white">
          {count}
        </span>
        selected
      </span>

      <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

      <ToolbarButton
        onClick={handleArchive}
        loading={isPending("archive")}
        disabled={anyPending}
        icon={<Archive className="h-3.5 w-3.5" />}
        label="Archive"
      />
      <ToolbarButton
        onClick={handleRestore}
        loading={isPending("restore")}
        disabled={anyPending}
        icon={<ArchiveRestore className="h-3.5 w-3.5" />}
        label="Restore"
      />
      <ToolbarButton
        onClick={handleWatch}
        loading={isPending("watch")}
        disabled={anyPending}
        icon={<Eye className="h-3.5 w-3.5" />}
        label="Watch"
      />
      <ToolbarButton
        onClick={handleUnwatch}
        loading={isPending("unwatch")}
        disabled={anyPending}
        icon={<EyeOff className="h-3.5 w-3.5" />}
        label="Unwatch"
      />

      <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

      <ToolbarButton
        onClick={handleCopyLinks}
        loading={isPending("copy_share_links")}
        disabled={anyPending}
        icon={<Link2 className="h-3.5 w-3.5" />}
        label="Copy links"
      />
      <ToolbarButton
        onClick={handleEmail}
        loading={isPending("email_selection")}
        disabled={anyPending}
        icon={<Mail className="h-3.5 w-3.5" />}
        label="Email"
      />
      <ToolbarButton
        onClick={handleOpenPortfolioModal}
        loading={false}
        disabled={anyPending}
        icon={<Briefcase className="h-3.5 w-3.5" />}
        label="Save as portfolio"
        accent
      />

      <SavePortfolioModal
        isOpen={portfolioModalOpen}
        onClose={() => setPortfolioModalOpen(false)}
        cardIds={selectedCardIds}
        workstreamId={workstreamId}
        getAuthToken={getAuthToken}
        onCreated={(portfolio) => {
          setPortfolioModalOpen(false);
          showToast("success", `Created "${portfolio.name}"`);
          onClearSelection();
          navigate(`/workstreams/${workstreamId}/portfolios/${portfolio.id}`);
        }}
      />

      <div className="ml-auto" />

      <button
        type="button"
        onClick={onClearSelection}
        disabled={anyPending}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 dark:text-gray-300",
          "hover:bg-gray-100 dark:hover:bg-dark-surface",
          "disabled:opacity-50",
        )}
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}

function ToolbarButton({
  onClick,
  loading,
  disabled,
  icon,
  label,
  accent,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        accent
          ? "border-brand-blue bg-brand-blue text-white hover:bg-brand-blue/90"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-dark-surface dark:text-gray-200 dark:hover:bg-dark-surface-hover",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

export default SelectionToolbar;
