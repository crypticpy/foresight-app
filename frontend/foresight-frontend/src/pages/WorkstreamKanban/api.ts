/**
 * Page-specific API helper: downloads the workstream PDF/PPTX report
 * directly to disk via a blob URL. Lives here (rather than in
 * `lib/workstream-api.ts`) because it owns the DOM-side file-save dance
 * — the rest of the API surface is data-fetch only.
 *
 * @module pages/WorkstreamKanban/api
 */

import { API_BASE_URL } from "../../lib/config";

export interface WorkstreamReportRequest {
  workstreamId: string;
  workstreamName: string;
  format: "pdf" | "pptx";
  token: string;
}

export async function downloadWorkstreamReport({
  workstreamId,
  workstreamName,
  format,
  token,
}: WorkstreamReportRequest): Promise<void> {
  const exportUrl = `${API_BASE_URL}/api/v1/workstreams/${workstreamId}/export/${format}`;

  const response = await fetch(exportUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Export failed: ${response.status}`);
  }

  const safeName = workstreamName.replace(/[^a-zA-Z0-9-_]/g, "_");
  let filename = `${safeName}.${format}`;

  const contentDisposition = response.headers.get("Content-Disposition");
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1];
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
