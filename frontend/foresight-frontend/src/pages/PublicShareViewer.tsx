import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicShare, type PublicSharePayload } from "../lib/share-links-api";

export default function PublicShareViewer() {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicSharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchPublicShare(token).then(setPayload).catch((err) => {
      setError(err instanceof Error ? err.message : "Share unavailable");
    });
  }, [token]);

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-slate-900">
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center opacity-5">
        <span className="-rotate-12 text-7xl font-bold">{payload?.watermark || "Foresight"}</span>
      </div>
      <div className="relative mx-auto max-w-4xl">
        <p className="mb-2 text-sm font-medium text-slate-500">
          Foresight - City of Austin
        </p>
        {error && <p className="rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>}
        {payload && (
          <article className="rounded border border-slate-200 p-6">
            <h1 className="text-2xl font-semibold capitalize">
              {payload.target_type} Share
            </h1>
            <pre className="mt-6 max-h-[70vh] overflow-auto rounded bg-slate-50 p-4 text-sm">
              {JSON.stringify(payload.data, null, 2)}
            </pre>
          </article>
        )}
      </div>
    </main>
  );
}
