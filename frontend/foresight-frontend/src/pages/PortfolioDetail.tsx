/**
 * PortfolioDetail Page
 *
 * Shows a single portfolio: name + description (editable), the ordered list of
 * cards, and PDF/PPTX export buttons. Items can be removed and reordered via
 * up/down arrows. The 15-card limit lives on the backend so we just surface
 * its error message if it ever fires.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Briefcase,
  Check,
  FileDown,
  Loader2,
  Pencil,
  Presentation,
  Trash2,
} from "lucide-react";
import { supabase } from "../App";
import { cn } from "../lib/utils";
import {
  exportPortfolio,
  getPortfolio,
  removeItemFromPortfolio,
  reorderPortfolioItems,
  updatePortfolio,
  type PortfolioItem,
  type PortfolioWithItems,
} from "../lib/portfolios-api";
import { PillarBadge } from "../components/PillarBadge";

export default function PortfolioDetail() {
  const { id: workstreamId, portfolioId } = useParams<{
    id: string;
    portfolioId: string;
  }>();
  const navigate = useNavigate();

  const [portfolio, setPortfolio] = useState<PortfolioWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    if (!portfolioId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required");
      const fresh = await getPortfolio(token, portfolioId);
      setPortfolio(fresh);
      setDraftName(fresh.name);
      setDraftDescription(fresh.description ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, [portfolioId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const backHref = workstreamId
    ? `/workstreams/${workstreamId}/portfolios`
    : "/workstreams";

  const handleSaveMeta = async () => {
    if (!portfolio) return;
    setSavingMeta(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required");
      const updated = await updatePortfolio(token, portfolio.id, {
        name: draftName.trim() || portfolio.name,
        description: draftDescription.trim(),
      });
      setPortfolio({ ...portfolio, ...updated });
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingMeta(false);
    }
  };

  const handleRemove = async (item: PortfolioItem) => {
    if (!portfolio) return;
    setRemovingId(item.card_id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required");
      await removeItemFromPortfolio(token, portfolio.id, item.card_id);
      setPortfolio({
        ...portfolio,
        items: portfolio.items.filter((i) => i.card_id !== item.card_id),
        item_count: Math.max(0, portfolio.item_count - 1),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemovingId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!portfolio) return;
    const next = index + direction;
    if (next < 0 || next >= portfolio.items.length) return;
    const reordered = [...portfolio.items];
    const a = reordered[index];
    const b = reordered[next];
    if (!a || !b) return;
    reordered[index] = b;
    reordered[next] = a;

    // Optimistic UI
    setPortfolio({ ...portfolio, items: reordered });
    setReordering(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required");
      const fresh = await reorderPortfolioItems(
        token,
        portfolio.id,
        reordered.map((it, i) => ({ card_id: it.card_id, position: i })),
      );
      setPortfolio({ ...portfolio, items: fresh });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Reorder failed");
      load();
    } finally {
      setReordering(false);
    }
  };

  const handleExport = async (format: "pdf" | "pptx") => {
    if (!portfolio) return;
    setExporting(format);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required");
      await exportPortfolio(token, portfolio.id, format);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading portfolio…
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="mt-6 text-sm text-red-600 dark:text-red-400">
          {error ?? "Portfolio not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-4">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-brand-blue"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to portfolios
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface-elevated p-5 mb-5">
        {!editing ? (
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[14rem]">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-brand-blue" />
                {portfolio.name}
              </h1>
              {portfolio.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">
                  {portfolio.description}
                </p>
              )}
              <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  {portfolio.items.length} signal
                  {portfolio.items.length === 1 ? "" : "s"}
                </span>
                <span>
                  Updated {new Date(portfolio.updated_at).toLocaleDateString()}
                </span>
                {portfolio.last_exported_at && (
                  <span>
                    Last exported{" "}
                    {new Date(portfolio.last_exported_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-dark-surface-hover"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Name
              </label>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Description
              </label>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftName(portfolio.name);
                  setDraftDescription(portfolio.description ?? "");
                }}
                disabled={savingMeta}
                className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-dark-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMeta}
                disabled={savingMeta || draftName.trim().length < 2}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-50"
              >
                {savingMeta ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Signals in this portfolio
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null || portfolio.items.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-dark-surface-hover disabled:opacity-50"
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport("pptx")}
            disabled={exporting !== null || portfolio.items.length === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              "bg-brand-blue text-white hover:bg-brand-blue/90",
              "disabled:opacity-50",
            )}
          >
            {exporting === "pptx" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Presentation className="h-3.5 w-3.5" />
            )}
            Export PPTX
          </button>
        </div>
      </div>

      {portfolio.items.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
          This portfolio is empty. Add cards from the kanban board.
          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                workstreamId
                  ? navigate(`/workstreams/${workstreamId}/board`)
                  : navigate("/workstreams")
              }
              className="text-brand-blue hover:underline"
            >
              Go to board
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {portfolio.items.map((item, index) => {
            const card = item.card;
            const cardHref = card?.slug
              ? `/signals/${card.slug}`
              : `/signals/${item.card_id}`;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface-elevated p-3 flex items-center gap-3"
              >
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-surface text-xs text-gray-700 dark:text-gray-200 px-2">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    to={cardHref}
                    className="block text-sm font-medium leading-snug text-gray-900 dark:text-white hover:text-brand-blue break-words"
                  >
                    {card?.name ?? "(card unavailable)"}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {card?.pillar_id && (
                      <PillarBadge pillarId={card.pillar_id} size="sm" />
                    )}
                    {card?.horizon && <span>{card.horizon}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={reordering || index === 0 || removingId !== null}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-surface disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={
                      reordering ||
                      index === portfolio.items.length - 1 ||
                      removingId !== null
                    }
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-surface disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    disabled={removingId === item.card_id || reordering}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-dark-surface disabled:opacity-50"
                    aria-label={`Remove ${card?.name ?? "card"}`}
                  >
                    {removingId === item.card_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
