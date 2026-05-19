import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Tag as TagIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { searchTags, type Tag } from "../../lib/tags-api";

const SUGGESTION_LIMIT = 8;
const DEBOUNCE_MS = 180;
const LABEL_MAX = 60;

export interface TagEditorProps {
  /** Resolves to a Supabase JWT or null. */
  getAuthToken: () => Promise<string | null>;
  /** Called when the user picks an existing tag or submits a new label. */
  onApply: (label: string) => Promise<void> | void;
  /** Slugs already applied on the card — used to dim them in suggestions. */
  existingSlugs?: string[];
  /** Inline placeholder. */
  placeholder?: string;
  /** Optional disabled state during saves. */
  disabled?: boolean;
  className?: string;
}

export const TagEditor: React.FC<TagEditorProps> = ({
  getAuthToken,
  onApply,
  existingSlugs = [],
  placeholder = "Add a tag…",
  disabled = false,
  className,
}) => {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingSet = useMemo(
    () => new Set(existingSlugs.map((s) => s.toLowerCase())),
    [existingSlugs],
  );

  // Close popover on outside-click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Debounced autocomplete fetch.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await searchTags(token, value, SUGGESTION_LIMIT);
        setSuggestions(res.tags);
        setActiveIdx(0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, open, getAuthToken]);

  const trimmed = value.trim();
  const normalizedTrimmed = trimmed.toLowerCase();
  const exactMatch = suggestions.find(
    (s) => s.label.toLowerCase() === normalizedTrimmed,
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  const submit = useCallback(
    async (label: string) => {
      const cleaned = label.trim();
      if (!cleaned) return;
      if (cleaned.length > LABEL_MAX) return;
      try {
        await onApply(cleaned);
        setValue("");
        setSuggestions([]);
        setOpen(false);
      } catch {
        // useCardTags surfaces the error; keep input open so user can retry.
      }
    },
    [onApply],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && event.key !== "Escape") setOpen(true);
    const optionCount = suggestions.length + (showCreate ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIdx((idx) => (optionCount === 0 ? 0 : (idx + 1) % optionCount));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((idx) =>
        optionCount === 0 ? 0 : (idx - 1 + optionCount) % optionCount,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (showCreate && activeIdx === suggestions.length) {
        submit(trimmed);
      } else if (suggestions[activeIdx]) {
        submit(suggestions[activeIdx].label);
      } else if (trimmed) {
        submit(trimmed);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full border bg-white px-2 py-1 text-xs transition-colors duration-200 dark:bg-dark-surface-elevated",
          "border-gray-300 focus-within:border-brand-blue dark:border-dark-surface-hover dark:focus-within:border-brand-blue",
          disabled && "opacity-60",
        )}
      >
        <TagIcon className="h-3 w-3 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={LABEL_MAX}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-xs placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
          aria-label="Add tag"
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>
      {open && (suggestions.length > 0 || showCreate || loading) && (
        <ul
          className="absolute z-30 mt-1 max-h-60 w-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-dark-surface-hover dark:bg-dark-surface-elevated"
          role="listbox"
        >
          {loading && suggestions.length === 0 && !showCreate && (
            <li className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              Searching…
            </li>
          )}
          {suggestions.map((tag, idx) => {
            const already = existingSet.has(tag.slug);
            const active = idx === activeIdx;
            return (
              <li
                key={tag.id}
                role="option"
                aria-selected={active}
                aria-disabled={already}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs",
                  active
                    ? "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-blue-200"
                    : "text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-dark-surface-hover",
                  already && "opacity-50",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!already) submit(tag.label);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <span className="truncate">{tag.label}</span>
                {already && (
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    on card
                  </span>
                )}
              </li>
            );
          })}
          {showCreate && (
            <li
              role="option"
              aria-selected={activeIdx === suggestions.length}
              className={cn(
                "flex cursor-pointer items-center gap-2 border-t border-gray-100 px-3 py-1.5 text-xs dark:border-dark-surface-hover",
                activeIdx === suggestions.length
                  ? "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-green-300"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-dark-surface-hover",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(trimmed);
              }}
              onMouseEnter={() => setActiveIdx(suggestions.length)}
            >
              <Plus className="h-3 w-3" />
              <span className="truncate">Create "{trimmed}"</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
