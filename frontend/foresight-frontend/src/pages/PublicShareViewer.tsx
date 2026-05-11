import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../hooks/useAuthContext";
import {
  fetchPublicShare,
  type PublicSharePayload,
} from "../lib/share-links-api";
import { CardDetail } from "../components/CardDetail";

export default function PublicShareViewer() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuthContext();
  const [payload, setPayload] = useState<PublicSharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clear prior payload/error so a token change doesn't briefly render
    // the previous share's card while the new fetch is in flight.
    setPayload(null);
    setError(null);
    if (!token || !user) return;
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) =>
        fetchPublicShare(token, data.session?.access_token ?? undefined),
      )
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Share unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  if (loading) return null;

  if (!user && token) {
    return <Navigate to={`/login?redirect=/shared/${token}`} replace />;
  }

  const sender = payload?.created_by_name || "the sender";
  const cardSlug =
    payload?.target_type === "card" && typeof payload.data.slug === "string"
      ? payload.data.slug
      : undefined;

  return (
    <main className="min-h-screen bg-brand-faded-white px-4 py-8 text-slate-900 dark:bg-brand-dark-blue">
      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h1 className="text-xl font-semibold">
              This signal was shared with you.
            </h1>
            <p className="mt-2 text-sm">
              This link is no longer active. Contact {sender} for a new one.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-flex rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white"
            >
              Sign in
            </Link>
          </div>
        )}
        {!error && !payload && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading shared signal...
          </p>
        )}
        {payload && cardSlug && (
          <CardDetail
            slugOverride={cardSlug}
            embedded
            readOnly
            onRelatedCardClick={(slug) => {
              window.location.href = `/signals/${slug}`;
            }}
          />
        )}
      </div>
    </main>
  );
}
