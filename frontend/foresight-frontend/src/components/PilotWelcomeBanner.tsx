/**
 * Daily welcome banner for pilot users. Reminds them this is alpha software,
 * thanks them for participating, and points them to the feedback channel for
 * bugs, feature requests, and ideas.
 *
 * Shows once per local calendar day: dismissing it stores today's date under
 * `pilot-welcome-dismissed`, so it reappears the next day. The feedback CTA
 * reuses the same mailto as the header bug icon (see `lib/bug-report`).
 *
 * @module components/PilotWelcomeBanner
 */

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { FlaskConical, MessageSquarePlus, Sparkles, X } from "lucide-react";

import { useAuthContext } from "../hooks/useAuthContext";
import { buildBugReportHref } from "../lib/bug-report";

const STORAGE_KEY = "pilot-welcome-dismissed";

/**
 * Routes whose page root fills the viewport (e.g. AskForesight's
 * `h-[calc(100vh-4rem)]`). An in-flow banner above those would make the page
 * taller than the viewport, dropping the bottom of the app-shell (the chat
 * input) below the fold. Suppress the banner there — it still shows on every
 * normal-scroll page, including the default landing route.
 */
const FULL_HEIGHT_ROUTES = ["/ask"];

/** Local YYYY-MM-DD — the banner is keyed to the user's calendar day. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PilotWelcomeBanner() {
  const { user } = useAuthContext();
  const { pathname } = useLocation();
  // Scope dismissal to the user so one person dismissing on a shared
  // workstation doesn't hide the banner from the next person the same day.
  const storageKey = `${STORAGE_KEY}-${user?.id ?? "anon"}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === todayKey();
    } catch {
      return false;
    }
  });

  const onFullHeightRoute = FULL_HEIGHT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  if (onFullHeightRoute || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, todayKey());
    } catch {
      // localStorage may be unavailable (private window); dismiss for this
      // session only and let it reappear on the next visit.
    }
  };

  const feedbackHref = buildBugReportHref(
    user?.email,
    "Foresight Pilot Feedback",
  );

  return (
    <div
      role="region"
      aria-label="Pilot welcome message"
      className="border-b border-brand-blue/20 bg-gradient-to-r from-brand-blue via-brand-blue/95 to-brand-green text-white"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="mt-0.5 hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 sm:flex">
          <Sparkles className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Welcome to the Foresight pilot</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
              <FlaskConical className="h-3 w-3" />
              Alpha
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-white/90">
            You&rsquo;re one of a small group helping shape this tool before its
            wider launch &mdash; thank you. Because it&rsquo;s{" "}
            <strong className="font-semibold">alpha software</strong>, you may
            hit rough edges. Found a bug, have a feature idea, or want to tell
            us how something&rsquo;s working? We genuinely want to hear it.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <a
              href={feedbackHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-brand-blue transition-colors duration-200 hover:bg-white/90"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Share feedback
            </a>
            <span className="text-xs text-white/75">
              &hellip;or use the bug icon in the top bar anytime.
            </span>
          </div>
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss welcome message"
          className="flex-shrink-0 rounded p-1 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
