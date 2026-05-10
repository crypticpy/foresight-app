/**
 * Keyword-based tone detector for assistant messages. Picks one of
 * `risk` / `opportunity` / neutral and returns the matching Tailwind
 * left-border accent class, so the message bubble subtly signals the
 * dominant sentiment of the answer.
 *
 * @module components/Chat/ChatMessage/tone
 */

const RISK_WORDS = [
  "risk",
  "warning",
  "threat",
  "concern",
  "danger",
  "decline",
  "challenge",
  "vulnerability",
  "disruption",
  "failure",
  "obstacle",
];

const OPPORTUNITY_WORDS = [
  "opportunity",
  "growth",
  "innovation",
  "benefit",
  "advantage",
  "improvement",
  "progress",
  "success",
  "promising",
  "potential",
  "recommend",
];

/**
 * Returns a Tailwind border class for the dominant tone of `content`,
 * or an empty string if neither side wins by ≥2 keyword hits.
 */
export function detectToneBorder(content: string): string {
  const lower = content.toLowerCase();

  const riskScore = RISK_WORDS.reduce(
    (count, word) => count + (lower.includes(word) ? 1 : 0),
    0,
  );
  const opportunityScore = OPPORTUNITY_WORDS.reduce(
    (count, word) => count + (lower.includes(word) ? 1 : 0),
    0,
  );

  if (riskScore >= 2 && riskScore > opportunityScore) {
    return "border-l-[2px] border-l-amber-400 dark:border-l-amber-500/60";
  }
  if (opportunityScore >= 2 && opportunityScore > riskScore) {
    return "border-l-[2px] border-l-teal-400 dark:border-l-teal-500/60";
  }

  return "";
}
