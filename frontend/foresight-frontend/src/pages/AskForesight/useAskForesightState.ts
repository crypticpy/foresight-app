/**
 * State container for the AskForesight page:
 *   - selected scope + scope dropdown open/closed
 *   - active conversation id / scope / scope id (persisted to sessionStorage)
 *   - `forceNew` flag so ChatPanel skips auto-restore when the user
 *     arrives with `?q=...` or clicks "New Chat"
 *   - desktop sidebar collapse (persisted to localStorage)
 *   - mobile sidebar open/closed
 *   - debounced conversation search
 *
 * The `chatSession` counter is bumped on every explicit re-anchor
 * (new chat, conversation pick, scope change) and feeds the `key`
 * for ChatPanel so a fresh instance mounts without re-mounting on
 * the natural null→UUID transition from the streaming `done` event.
 *
 * @module pages/AskForesight/useAskForesightState
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  deleteConversation,
  fetchConversations,
  searchConversations,
} from "../../lib/chat-api";
import type { Conversation } from "../../lib/chat-api";
import type { ScopeOption, Workstream } from "./utils";

type ScopeKind = "global" | "signal" | "workstream";

const SS_CONV_ID = "foresight:ask:activeConversationId";
const SS_SCOPE = "foresight:ask:activeScope";
const SS_SCOPE_ID = "foresight:ask:activeScopeId";
const LS_COLLAPSED = "foresight:ask:sidebarCollapsed";

export interface UseAskForesightStateResult {
  // Scope
  selectedScope: ScopeOption;
  scopeOptions: ScopeOption[];
  scopeDropdownOpen: boolean;
  setScopeDropdownOpen: (next: boolean) => void;
  handleScopeChange: (option: ScopeOption) => void;

  // Effective scope for ChatPanel
  effectiveScope: ScopeKind;
  effectiveScopeId: string | undefined;

  // Active conversation
  activeConversationId: string | null;
  forceNewChat: boolean;
  initialQuery: string | undefined;
  chatKey: string;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (next: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;

  // Conversations
  conversations: Conversation[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: Conversation[] | null;
  isSearching: boolean;

  // Handlers
  handleNewChat: () => void;
  handleSelectConversation: (conv: Conversation) => void;
  handleConversationChange: (convId: string | null) => void;
  handleDeleteConversation: (e: React.MouseEvent, convId: string) => void;
}

export function useAskForesightState(): UseAskForesightStateResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // Arriving with ?q=... (e.g. from "Explore" on a pattern card) means
  // the user wants a fresh chat seeded with that query — not a resumed
  // conversation. Compute once so the initializers can branch on it.
  const arrivedWithQuery =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("q");

  const [selectedScope, setSelectedScope] = useState<ScopeOption>({
    label: "All Signals",
    scope: "global",
  });
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => {
    if (arrivedWithQuery) return null;
    try {
      return sessionStorage.getItem(SS_CONV_ID);
    } catch {
      return null;
    }
  });
  const [activeConversationScope, setActiveConversationScope] =
    useState<ScopeKind>(() => {
      if (arrivedWithQuery) return "global";
      try {
        return (sessionStorage.getItem(SS_SCOPE) as ScopeKind) || "global";
      } catch {
        return "global";
      }
    });
  const [activeConversationScopeId, setActiveConversationScopeId] = useState<
    string | undefined
  >(() => {
    if (arrivedWithQuery) return undefined;
    try {
      return sessionStorage.getItem(SS_SCOPE_ID) || undefined;
    } catch {
      return undefined;
    }
  });
  const [forceNewChat, setForceNewChat] = useState<boolean>(
    () => !!arrivedWithQuery,
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_COLLAPSED) === "true";
    } catch {
      return false;
    }
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);

  const initialQuery = searchParams.get("q") || undefined;

  const chatSessionRef = useRef(0);
  const chatKey = `${chatSessionRef.current}-${selectedScope.scope}-${selectedScope.scopeId || "none"}`;

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchConversations({ limit: 50 });
      setConversations(data);
    } catch {
      // Non-critical
    }
  }, []);

  const loadWorkstreams = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("workstreams")
        .select("id, name")
        .order("name", { ascending: true });

      if (!error && data) {
        setWorkstreams(data as Workstream[]);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadWorkstreams();
  }, [loadConversations, loadWorkstreams]);

  // After ChatPanel consumes the ?q= seed, strip it from the URL so a
  // refresh or back-navigation doesn't re-fire the same query.
  const seedClearedRef = useRef(false);
  useEffect(() => {
    if (!seedClearedRef.current && searchParams.get("q")) {
      seedClearedRef.current = true;
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Persist active conversation to sessionStorage
  useEffect(() => {
    try {
      if (activeConversationId) {
        sessionStorage.setItem(SS_CONV_ID, activeConversationId);
        sessionStorage.setItem(SS_SCOPE, activeConversationScope);
        if (activeConversationScopeId) {
          sessionStorage.setItem(SS_SCOPE_ID, activeConversationScopeId);
        } else {
          sessionStorage.removeItem(SS_SCOPE_ID);
        }
      } else {
        sessionStorage.removeItem(SS_CONV_ID);
        sessionStorage.removeItem(SS_SCOPE);
        sessionStorage.removeItem(SS_SCOPE_ID);
      }
    } catch {
      // sessionStorage unavailable
    }
  }, [
    activeConversationId,
    activeConversationScope,
    activeConversationScopeId,
  ]);

  // Persist sidebar collapsed to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_COLLAPSED, String(sidebarCollapsed));
    } catch {
      // localStorage unavailable
    }
  }, [sidebarCollapsed]);

  // Debounced conversation search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchConversations(searchQuery.trim(), 20);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleNewChat = useCallback(() => {
    chatSessionRef.current += 1;
    setActiveConversationId(null);
    setActiveConversationScope("global");
    setActiveConversationScopeId(undefined);
    setForceNewChat(true);
    setSearchParams({});
    setSidebarOpen(false);
  }, [setSearchParams]);

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      chatSessionRef.current += 1;
      setActiveConversationId(conv.id);
      setActiveConversationScope(conv.scope);
      setActiveConversationScopeId(conv.scope_id);
      setForceNewChat(false);
      setSearchParams({});
      setSidebarOpen(false);
    },
    [setSearchParams],
  );

  const handleConversationChange = useCallback(
    (convId: string | null) => {
      if (convId && convId !== activeConversationId) {
        setActiveConversationId(convId);
        setForceNewChat(false);
        loadConversations();
      }
    },
    [activeConversationId, loadConversations],
  );

  const handleDeleteConversation = useCallback(
    async (e: React.MouseEvent, convId: string) => {
      e.stopPropagation();
      try {
        await deleteConversation(convId);
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeConversationId === convId) {
          setActiveConversationId(null);
        }
      } catch {
        // Silently fail
      }
    },
    [activeConversationId],
  );

  const handleScopeChange = useCallback(
    (option: ScopeOption) => {
      chatSessionRef.current += 1;
      setSelectedScope(option);
      setScopeDropdownOpen(false);
      setActiveConversationId(null);
      setActiveConversationScope(option.scope);
      setActiveConversationScopeId(option.scopeId);
      setSearchParams({});
    },
    [setSearchParams],
  );

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const effectiveScope: ScopeKind = activeConversationId
    ? activeConversationScope
    : selectedScope.scope;
  const effectiveScopeId = activeConversationId
    ? activeConversationScopeId
    : selectedScope.scopeId;

  const scopeOptions: ScopeOption[] = [
    { label: "All Signals", scope: "global" },
    ...workstreams.map((ws) => ({
      label: ws.name,
      scope: "workstream" as const,
      scopeId: ws.id,
    })),
  ];

  return {
    selectedScope,
    scopeOptions,
    scopeDropdownOpen,
    setScopeDropdownOpen,
    handleScopeChange,
    effectiveScope,
    effectiveScopeId,
    activeConversationId,
    forceNewChat,
    initialQuery,
    chatKey,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    conversations,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    handleNewChat,
    handleSelectConversation,
    handleConversationChange,
    handleDeleteConversation,
  };
}
