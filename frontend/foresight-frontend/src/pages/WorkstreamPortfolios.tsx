/**
 * WorkstreamPortfolios Page
 *
 * Lists portfolios scoped to a single workstream. Each row is a card showing
 * name, description, item count, last-exported timestamp, and a delete action.
 * Phase 1: portfolios are workstream-scoped — this is the main entry point.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "../App";
import { cn } from "../lib/utils";
import {
  deletePortfolio,
  listPortfolios,
  type Portfolio,
} from "../lib/portfolios-api";

interface WorkstreamLite {
  id: string;
  name: string;
}

export default function WorkstreamPortfolios() {
  const { id: workstreamId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workstream, setWorkstream] = useState<WorkstreamLite | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    if (!workstreamId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required");

      // Workstream name (best-effort — page still renders if this fails)
      const wsRes = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/v1/me/workstreams/${workstreamId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ).catch(() => null);
      if (wsRes && wsRes.ok) {
        const ws = await wsRes.json();
        setWorkstream({ id: ws.id, name: ws.name });
      }

      const list = await listPortfolios(token, workstreamId);
      setPortfolios(list);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load portfolios",
      );
    } finally {
      setLoading(false);
    }
  }, [workstreamId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this portfolio? Cards stay in the workstream."))
      return;
    const token = await getToken();
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

  const headerName = useMemo(
    () => workstream?.name ?? "Workstream",
    [workstream],
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="mb-6">
        <Link
          to={`/workstreams/${workstreamId}/board`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-brand-blue"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {headerName}
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-brand-blue" />
              Portfolios
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Curated signal collections from this workstream that you can
              revisit and export as a presentation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/workstreams/${workstreamId}/board`)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-brand-blue px-3 py-1.5 text-sm font-medium",
              "bg-brand-blue text-white hover:bg-brand-blue/90",
            )}
          >
            <Plus className="h-4 w-4" />
            Build from board
          </button>
        </div>
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
            Select cards on the kanban board, then choose “Save as portfolio” to
            bundle them for export.
          </p>
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
                <Link
                  to={`/workstreams/${workstreamId}/portfolios/${p.id}`}
                  className="flex-1 min-w-0"
                >
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
                    {p.last_exported_at && (
                      <span>
                        Last exported{" "}
                        {new Date(p.last_exported_at).toLocaleDateString()}
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
