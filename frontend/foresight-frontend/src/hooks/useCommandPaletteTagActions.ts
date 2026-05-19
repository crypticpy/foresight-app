/**
 * Debounced tag-search → `CommandAction[]` for the ⌘K palette.
 *
 * The Dashboard host hooks this up to the palette's `onQueryChange`
 * callback: as the user types, we hit `/api/v1/tags?q=…`, then surface
 * each match as a "Browse tag: <label>" action that navigates to
 * `/tags/<slug>`. The palette itself stays dumb — it just renders the
 * combined action list.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Tag as TagIcon } from "lucide-react";
import type { NavigateFunction } from "react-router-dom";
import type { CommandAction } from "../components/CommandPalette";
import { searchTags } from "../lib/tags-api";

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 6;
// Minimum query length before we hit the search endpoint — single-char
// queries match nearly every tag in the dictionary and aren't useful.
const MIN_QUERY_LEN = 2;

export function useCommandPaletteTagActions(
  query: string,
  navigate: NavigateFunction,
  getAuthToken: () => Promise<string | null>,
): CommandAction[] {
  const [actions, setActions] = useState<CommandAction[]>([]);
  const mounted = useRef(true);
  const requestSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchTags = useCallback(
    async (q: string) => {
      const seq = ++requestSeq.current;
      const token = await getAuthToken();
      if (!token) return;
      try {
        const res = await searchTags(token, q, RESULT_LIMIT);
        if (seq !== requestSeq.current || !mounted.current) return;
        const next: CommandAction[] = res.tags.map((tag) => ({
          id: `tag:${tag.slug}`,
          name: `Browse tag: ${tag.label}`,
          description: "Open the tag detail page",
          keywords: [tag.slug],
          icon: TagIcon,
          onActivate: () => navigate(`/tags/${encodeURIComponent(tag.slug)}`),
        }));
        setActions(next);
      } catch {
        // Swallow errors silently — the palette already renders the
        // static action list, so a failed tag lookup just means no extra
        // chips appear. Surfacing a toast here would be noisy.
        if (seq !== requestSeq.current || !mounted.current) return;
        setActions([]);
      }
    },
    [navigate, getAuthToken],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      // Clear stale tag suggestions when the user shortens the query so
      // unrelated tags don't linger in the list.
      setActions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetchTags(trimmed);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, fetchTags]);

  return actions;
}
