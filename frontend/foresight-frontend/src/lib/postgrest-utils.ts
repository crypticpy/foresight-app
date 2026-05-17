/**
 * Sanitize a user-supplied substring for safe embedding inside a PostgREST
 * `.or()` expression that uses `ilike.%term%` branches.
 *
 * PostgREST LIKE-style metacharacters and OR-grammar reserved characters
 * that we strip (replace with a space, then trim):
 *
 * - `%` and `_` — LIKE wildcards (would let user input act as wildcards).
 * - `*` — alternative LIKE wildcard accepted by PostgREST (same risk as %).
 * - `\` — LIKE escape character; passing it through can desync the parser
 *   and either silently drop the next char or change wildcard semantics.
 * - `,` — branch delimiter inside `.or()`.
 * - `(` and `)` — reserved by the PostgREST OR-expression grammar.
 *
 * We drop these rather than backslash-escape because the search fields are
 * short user-controlled text and the metacharacters carry no useful
 * substring-match intent.
 */
export function sanitizeForOrIlike(raw: string): string {
  return raw
    .replace(/[%_*\\]/g, " ")
    .replace(/[,()]/g, " ")
    .trim();
}
