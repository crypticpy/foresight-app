/**
 * Portfolios API Client
 *
 * Saved card collections (≤15 items) used to drive presentation export.
 * Phase 1: portfolios are scoped to a workstream. Phase 2: nullable scope
 * lets a portfolio cross workstreams.
 */

import { API_BASE_URL } from "./config";

export const PORTFOLIO_MAX_ITEMS = 15;

// ============================================================================
// Types (mirror backend/app/models/portfolio.py)
// ============================================================================

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  workstream_id: string | null;
  created_at: string;
  updated_at: string;
  last_exported_at: string | null;
  item_count: number;
}

export interface PortfolioItemCardSnapshot {
  id: string;
  name: string;
  slug: string | null;
  pillar_id: string | null;
  horizon: string | null;
  stage_id: number | null;
}

export interface PortfolioItem {
  id: string;
  portfolio_id: string;
  card_id: string;
  position: number;
  notes: string | null;
  added_at: string;
  card: PortfolioItemCardSnapshot | null;
}

export interface PortfolioWithItems extends Portfolio {
  items: PortfolioItem[];
}

export interface PortfolioCreatePayload {
  name: string;
  description?: string;
  workstream_id?: string | null;
  card_ids?: string[];
}

export interface PortfolioUpdatePayload {
  name?: string;
  description?: string;
  /** Pass `""` (empty string) to explicitly unscope a portfolio. */
  workstream_id?: string | null;
}

export interface PortfolioReorderEntry {
  card_id: string;
  position: number;
}

// ============================================================================
// Helpers
// ============================================================================

async function apiRequest<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(
      error.detail || error.message || `API error: ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// Portfolio CRUD
// ============================================================================

export async function listPortfolios(
  token: string,
  workstreamId?: string,
): Promise<Portfolio[]> {
  const qs = workstreamId
    ? `?workstream_id=${encodeURIComponent(workstreamId)}`
    : "";
  return apiRequest<Portfolio[]>(`/api/v1/me/portfolios${qs}`, token);
}

export async function getPortfolio(
  token: string,
  portfolioId: string,
): Promise<PortfolioWithItems> {
  return apiRequest<PortfolioWithItems>(
    `/api/v1/me/portfolios/${portfolioId}`,
    token,
  );
}

export async function createPortfolio(
  token: string,
  payload: PortfolioCreatePayload,
): Promise<PortfolioWithItems> {
  return apiRequest<PortfolioWithItems>(`/api/v1/me/portfolios`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePortfolio(
  token: string,
  portfolioId: string,
  payload: PortfolioUpdatePayload,
): Promise<Portfolio> {
  return apiRequest<Portfolio>(`/api/v1/me/portfolios/${portfolioId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deletePortfolio(
  token: string,
  portfolioId: string,
): Promise<void> {
  await apiRequest<void>(`/api/v1/me/portfolios/${portfolioId}`, token, {
    method: "DELETE",
  });
}

// ============================================================================
// Portfolio items
// ============================================================================

export async function addItemsToPortfolio(
  token: string,
  portfolioId: string,
  cardIds: string[],
): Promise<PortfolioItem[]> {
  return apiRequest<PortfolioItem[]>(
    `/api/v1/me/portfolios/${portfolioId}/items`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ card_ids: cardIds }),
    },
  );
}

export async function removeItemFromPortfolio(
  token: string,
  portfolioId: string,
  cardId: string,
): Promise<void> {
  await apiRequest<void>(
    `/api/v1/me/portfolios/${portfolioId}/items/${cardId}`,
    token,
    { method: "DELETE" },
  );
}

export async function reorderPortfolioItems(
  token: string,
  portfolioId: string,
  items: PortfolioReorderEntry[],
): Promise<PortfolioItem[]> {
  return apiRequest<PortfolioItem[]>(
    `/api/v1/me/portfolios/${portfolioId}/items`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ items }),
    },
  );
}

// ============================================================================
// Export
// ============================================================================

export interface PortfolioExportResult {
  status: "success";
  format: "pdf" | "pptx";
  filename: string;
}

/**
 * Export a portfolio as a presentation. Triggers a browser download.
 */
export async function exportPortfolio(
  token: string,
  portfolioId: string,
  format: "pdf" | "pptx",
): Promise<PortfolioExportResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/me/portfolios/${portfolioId}/export`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ format }),
    },
  );

  if (!response.ok) {
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
          errorData.message ||
          `Export failed: ${response.status}`,
      );
    }
    throw new Error(`Export failed: ${response.status}`);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  let filename = `portfolio-export.${format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(
      /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
    );
    if (match && match[1]) {
      filename = match[1].replace(/['"]/g, "");
    }
  }

  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);

  return { status: "success", format, filename };
}
