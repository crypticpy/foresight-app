/**
 * Live hybrid-search demo: runs both a tokenized keyword search (one
 * `/cards/search` call per non-stopword token, then merged by hit count) and
 * a vector search against the same endpoint, then visualises an RRF-fused
 * ranking next to the two raw rankings.
 *
 * The keyword path tokenizes because the backend's text mode does
 * `ilike %query%` against name/summary, so a multi-word phrase rarely
 * matches; one search per significant word, deduped & ranked by hit-count,
 * gives a much more useful demo.
 *
 * @module pages/HowItWorks/HybridSearchDemo
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { API_BASE_URL } from "../../lib/config";

interface SearchHit {
  id: string;
  name: string;
  slug?: string;
  summary?: string;
  pillar_id?: string;
  search_relevance?: number;
}

export function HybridSearchDemo() {
  const [query, setQuery] = useState("");
  const [textHits, setTextHits] = useState<SearchHit[]>([]);
  const [vectorHits, setVectorHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setTextHits([]);
    setVectorHits([]);
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const STOPWORDS = new Set([
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "about",
        "this",
        "that",
        "are",
        "was",
        "were",
        "but",
        "not",
        "you",
        "your",
        "have",
        "has",
        "will",
        "can",
        "all",
        "any",
        "how",
        "what",
        "when",
        "where",
        "why",
        "who",
      ]);
      const tokens = q
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
      const keywordTokens = tokens.length > 0 ? tokens : [q];
      const body = (queryStr: string, vector: boolean) =>
        JSON.stringify({
          query: queryStr,
          use_vector_search: vector,
          limit: 5,
          offset: 0,
        });
      const parse = async (r: Response): Promise<SearchHit[]> => {
        if (!r.ok) return [];
        const data = await r.json();
        const arr = Array.isArray(data) ? data : data?.results;
        return Array.isArray(arr) ? arr.slice(0, 10) : [];
      };
      const keywordPromise = Promise.all(
        keywordTokens.map((tok) =>
          fetch(`${API_BASE_URL}/api/v1/cards/search`, {
            method: "POST",
            headers,
            body: body(tok, false),
          }).then(parse),
        ),
      ).then((batches) => {
        const counts: Record<
          string,
          { hit: SearchHit; count: number; firstRank: number }
        > = {};
        batches.forEach((batch) => {
          batch.forEach((h, i) => {
            const existing = counts[h.id];
            if (existing) {
              existing.count += 1;
              existing.firstRank = Math.min(existing.firstRank, i);
            } else {
              counts[h.id] = { hit: h, count: 1, firstRank: i };
            }
          });
        });
        return Object.values(counts)
          .sort((a, b) => b.count - a.count || a.firstRank - b.firstRank)
          .slice(0, 5)
          .map((x) => x.hit);
      });
      const vectorPromise = fetch(`${API_BASE_URL}/api/v1/cards/search`, {
        method: "POST",
        headers,
        body: body(q, true),
      }).then(parse);
      const [t, v] = await Promise.all([keywordPromise, vectorPromise]);
      setTextHits(t);
      setVectorHits(v.slice(0, 5));
      if (!t.length && !v.length) setError("No results — try a broader query.");
    } catch {
      setError("Search failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Simulated RRF fusion for visualization
  const fused = useMemo(() => {
    const rrf: Record<string, { hit: SearchHit; score: number }> = {};
    const k = 60;
    textHits.forEach((h, i) => {
      rrf[h.id] = { hit: h, score: 1 / (k + i + 1) };
    });
    vectorHits.forEach((h, i) => {
      const add = 1 / (k + i + 1);
      const existing = rrf[h.id];
      if (existing) existing.score += add;
      else rrf[h.id] = { hit: h, score: add };
    });
    return Object.values(rrf)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.hit);
  }, [textHits, vectorHits]);

  const Hit = ({ hit }: { hit: SearchHit }) => (
    <Link
      to={hit.slug ? `/signals/${hit.slug}` : `/signals`}
      className="block rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-brand-blue transition-colors bg-white dark:bg-dark-surface text-xs"
    >
      <div className="font-semibold text-gray-900 dark:text-white line-clamp-2">
        {hit.name}
      </div>
      {hit.summary && (
        <div className="text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
          {hit.summary}
        </div>
      )}
    </Link>
  );

  const exampleQueries = [
    "Austin housing affordability",
    "extreme heat resilience",
    "I-35 corridor mobility",
    "AI in city services",
  ];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface p-6 md:p-8">
      <form onSubmit={runSearch} className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try a query — e.g. 'Austin housing affordability'"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-surface-deep text-gray-900 dark:text-white text-sm focus:outline-none focus:border-brand-blue"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching…" : "Run hybrid search"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2 mb-6">
        {exampleQueries.map((q) => (
          <button
            key={q}
            onClick={() => {
              setQuery(q);
              setTimeout(() => runSearch(), 0);
            }}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm text-amber-700 dark:text-amber-400 mb-4">
          {error}
        </div>
      )}

      {searched && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Keyword (FTS)
              </span>
              <span className="text-[10px] text-gray-400">
                {textHits.length}
              </span>
            </div>
            <div className="space-y-2">
              {loading
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-gray-100 dark:bg-dark-surface-deep animate-pulse"
                    />
                  ))
                : textHits.map((h) => <Hit key={h.id} hit={h} />)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-blue">
                Semantic (vector)
              </span>
              <span className="text-[10px] text-gray-400">
                {vectorHits.length}
              </span>
            </div>
            <div className="space-y-2">
              {loading
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-brand-blue/10 animate-pulse"
                    />
                  ))
                : vectorHits.map((h) => <Hit key={h.id} hit={h} />)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-green">
                Fused (RRF)
              </span>
              <span className="text-[10px] text-gray-400">{fused.length}</span>
            </div>
            <div className="space-y-2">
              {loading
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-brand-green/10 animate-pulse"
                    />
                  ))
                : fused.map((h) => <Hit key={h.id} hit={h} />)}
            </div>
          </div>
        </div>
      )}
      {!searched && (
        <div className="rounded-lg p-6 bg-gray-50 dark:bg-dark-surface-deep text-sm text-gray-600 dark:text-gray-400 text-center">
          Run a search to see keyword matches, semantic matches, and the fused
          ranking side-by-side.
        </div>
      )}
    </div>
  );
}
