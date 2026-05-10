/**
 * Portfolios (global) page
 *
 * Phase 2: lists every portfolio the user owns regardless of workstream
 * scope. Each row links into the workstream-scoped detail route when scoped,
 * or to the global detail route when unscoped.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Loader2, Trash2 } from "lucide-react";
import { getAuthToken } from "../lib/auth";
import { cn } from "../lib/utils";
import {
  deletePortfolio,
  listPortfolios,
  type Portfolio,
} from "../lib/portfolios-api";

export default function Portfolios() {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required");
      const list = await listPortfolios(token);
      setPortfolios(list);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load portfolios",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this portfolio?")) return;
    const token = await getAuthToken();
    if (!token) return;
    setDeletingId(id);
    try {
      await deletePortfolio(token, id);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const detailHref = (p: Portfolio): string =>
    p.workstream_id
      ? `/workstreams/${p.workstream_id}/portfolios/${p.id}`
      : `/portfolios/${p.id}`;

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-brand-blue" />
          Portfolios
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Every signal collection you've curated across workstreams.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading portfolios…
        </div>
      )}

      {!loading && error && (
        <div className="text-sm text-red-600 dark:text-red-400 py-6">
          {error}
        </div>
      )}

      {!loading && !error && portfolios.length === 0 && (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
          <Briefcase className="h-8 w-8 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            No portfolios yet
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 max-w-md mx-auto">
            Open a workstream board, select cards, and use “Save as portfolio”
            to bundle them.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => navigate("/workstreams")}
              className="text-brand-blue hover:underline text-sm"
            >
              Browse workstreams →
            </button>
          </div>
        </div>
      )}

      {!loading && !error && portfolios.length > 0 && (
        <ul className="space-y-3">
          {portfolios.map((p) => (
            <li
              key={p.id}
              className={cn(
                "rounded-xl border bg-white dark:bg-dark-surface-elevated",
                "border-gray-200 dark:border-gray-700",
                "p-4 transition-colors hover:border-brand-blue/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <Link to={detailHref(p)} className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {p.name}
                  </h3>
                  {p.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>
                      {p.item_count} signal{p.item_count === 1 ? "" : "s"}
                    </span>
                    <span>
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                    {p.workstream_id ? (
                      <span className="inline-flex items-center rounded-full bg-brand-blue/10 text-brand-blue px-2 py-0.5">
                        Workstream-scoped
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-dark-surface px-2 py-0.5">
                        Cross-workstream
                      </span>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-dark-surface disabled:opacity-50"
                  aria-label={`Delete ${p.name}`}
                >
                  {deletingId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
