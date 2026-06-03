/**
 * Builds the "report a bug / share feedback" mailto used by the header bug
 * icon and the pilot welcome banner. Centralised here so the recipient and
 * the body template stay in one place.
 *
 * @module lib/bug-report
 */

export const BUG_REPORT_EMAIL = "Christopher.Collins@austintexas.gov";

/**
 * Pre-fills a feedback email with the current page URL and the reporter's
 * address. `subject` defaults to "Bug Report" (the header icon's wording);
 * callers can pass a broader subject (e.g. pilot feedback).
 */
export function buildBugReportHref(
  email: string | null | undefined,
  subject = "Bug Report",
): string {
  const encodedSubject = encodeURIComponent(subject);
  const body = encodeURIComponent(
    `\n\n---\nPage: ${typeof window !== "undefined" ? window.location.href : ""}\nReporter: ${email ?? ""}\n`,
  );
  return `mailto:${BUG_REPORT_EMAIL}?subject=${encodedSubject}&body=${body}`;
}
