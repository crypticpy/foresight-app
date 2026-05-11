/**
 * Extracts a filename from a `Content-Disposition` header value,
 * falling back to a caller-provided default when no filename is
 * present.
 *
 * @module hooks/useExportWithProgress/parseFilename
 */

const FILENAME_PATTERN = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;

export function parseFilename(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(FILENAME_PATTERN);
  if (match && match[1]) {
    return match[1].replace(/['"]/g, "");
  }
  return fallback;
}

/**
 * Reads an HTTP response and converts a JSON-shaped error body into a
 * single message string. Falls back to a generic message containing
 * the HTTP status when the body isn't JSON.
 */
export async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData?.detail) return errorData.detail;
    if (errorData?.message) return errorData.message;
  }
  return `Export failed: ${response.status}`;
}
