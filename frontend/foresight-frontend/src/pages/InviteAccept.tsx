import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  acceptInvite,
  previewInvite,
  type InvitePreview,
} from "../lib/collaboration-api";

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    previewInvite(token)
      .then(setPreview)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Invite unavailable");
      });
  }, [token]);

  const [accepting, setAccepting] = useState(false);

  const accept = async () => {
    if (!token) return;
    const { data } = await supabase.auth.getSession();
    const authToken = data.session?.access_token;
    if (!authToken) {
      navigate(`/login?redirect=/invite/${token}`);
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptInvite(authToken, token);
      navigate(`/workstreams/${result.workstream_id}/board`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept invite");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Workstream Invitation
        </h1>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {preview && (
          <>
            <p className="mt-4 text-slate-600 dark:text-slate-300">
              {preview.inviter_display_name ||
                preview.inviter_email ||
                "A collaborator"}{" "}
              invited you to{" "}
              <span className="font-medium text-slate-900 dark:text-white">
                {preview.workstream_name}
              </span>{" "}
              as {preview.intended_role}.
            </p>
            <button
              type="button"
              onClick={accept}
              disabled={accepting}
              className="mt-6 rounded bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {accepting ? "Accepting…" : "Accept Invitation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
