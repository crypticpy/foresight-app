/**
 * Bulk-brief export surface: status check across the Brief column and the
 * portfolio export endpoint that bundles selected briefs into a single
 * PPTX/PDF download.
 *
 * @module lib/workstream/bulk-export
 */

import { API_BASE_URL } from "../config";
import { apiRequest } from "./shared";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Status of cards for bulk export.
 */
export interface BulkBriefCardStatus {
  card_id: string;
  card_name: string;
  has_brief: boolean;
  brief_status: string | null;
  position: number;
}

/**
 * Response for bulk brief status check.
 */
export interface BulkBriefStatusResponse {
  total_cards: number;
  cards_with_briefs: number;
  cards_ready: number;
  card_statuses: BulkBriefCardStatus[];
}

/**
 * Request for bulk brief export.
 */
export interface BulkExportRequest {
  format: "pptx" | "pdf";
  card_order: string[];
}

/**
 * Response for bulk brief export initiation.
 */
export interface BulkExportResponse {
  status: string;
  message: string;
  portfolio_id?: string;
  total_cards?: number;
  format?: string;
  pptx_url?: string;
  pdf_path?: string;
  error?: string;
  using_fallback?: boolean;
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

/**
 * Get the status of all cards in the Brief column for bulk export.
 * Returns information about which cards have completed briefs.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @returns Status of all cards in the Brief column
 */
export async function getBulkBriefStatus(
  token: string,
  workstreamId: string,
): Promise<BulkBriefStatusResponse> {
  return apiRequest<BulkBriefStatusResponse>(
    `/api/v1/me/workstreams/${workstreamId}/bulk-brief-status`,
    token,
  );
}

/**
 * Export multiple briefs as a single portfolio presentation.
 * Creates an AI-synthesized portfolio combining all selected briefs.
 * Handles both file downloads and JSON responses.
 *
 * @param token - Bearer authentication token
 * @param workstreamId - UUID of the workstream
 * @param format - Export format ('pptx' or 'pdf')
 * @param cardOrder - Ordered array of card IDs (from Kanban position)
 * @returns BulkExportResponse with status and optional URL
 */
export async function exportBulkBriefs(
  token: string,
  workstreamId: string,
  format: "pptx" | "pdf",
  cardOrder: string[],
): Promise<BulkExportResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/me/workstreams/${workstreamId}/bulk-brief-export`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format,
        card_order: cardOrder,
      }),
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

  // Check content type to determine response handling
  const contentType = response.headers.get("content-type");

  // If JSON response (unlikely but handle it)
  if (contentType?.includes("application/json")) {
    return response.json();
  }

  // File download response - extract and trigger download
  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  let filename = `portfolio-export.${format}`;

  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(
      /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
    );
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].replace(/['"]/g, "");
    }
  }

  // Trigger download
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);

  // Return success response
  return {
    status: "success",
    message: "Portfolio downloaded successfully",
    format,
    total_cards: cardOrder.length,
  };
}
