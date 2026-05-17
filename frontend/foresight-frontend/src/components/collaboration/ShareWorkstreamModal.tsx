import { useState } from "react";
import { Copy, X } from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import { addMember, createInvite } from "../../lib/collaboration-api";

interface ShareWorkstreamModalProps {
  workstreamId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function ShareWorkstreamModal({
  workstreamId,
  open,
  onClose,
  onChanged,
}: ShareWorkstreamModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "commenter" | "viewer">("viewer");
  const [accountType, setAccountType] = useState<"paid" | "guest">("paid");
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inviteExisting = async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      await addMember(token, workstreamId, { user_email: email, role });
      setEmail("");
      setError(null);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add member");
    }
  };

  const createLink = async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const result = await createInvite(token, workstreamId, {
        email: email || undefined,
        role,
        intended_account_type: accountType,
      });
      setShareUrl(result.share_url);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create invite");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Share Workstream
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close share"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="name@example.com"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Role
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Account
              <select
                value={accountType}
                onChange={(event) =>
                  setAccountType(event.target.value as typeof accountType)
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="paid">Paid user</option>
                <option value="guest">Guest</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={inviteExisting}
              className="rounded bg-brand-blue px-3 py-2 text-sm font-medium text-white"
            >
              Add Existing User
            </button>
            <button
              type="button"
              onClick={createLink}
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Create Invite Link
            </button>
          </div>
          {shareUrl && (
            <div className="flex items-center gap-2 rounded border border-slate-200 p-2 dark:border-slate-800">
              <input
                value={shareUrl}
                readOnly
                className="min-w-0 flex-1 bg-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(shareUrl)}
                className="rounded p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Copy invite link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
