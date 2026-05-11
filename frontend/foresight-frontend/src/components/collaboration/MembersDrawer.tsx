import { useCallback, useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { getAuthToken } from "../../lib/auth";
import {
  listMembers,
  removeMember,
  updateMemberRole,
  type WorkstreamMember,
} from "../../lib/collaboration-api";
import { RoleBadge } from "./RoleBadge";

interface MembersDrawerProps {
  workstreamId: string;
  open: boolean;
  canManage: boolean;
  onClose: () => void;
}

const editableRoles = ["editor", "commenter", "viewer"] as const;

export function MembersDrawer({
  workstreamId,
  open,
  canManage,
  onClose,
}: MembersDrawerProps) {
  const [members, setMembers] = useState<WorkstreamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      setMembers(await listMembers(token, workstreamId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load members");
    }
  }, [workstreamId]);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  const changeRole = async (member: WorkstreamMember, role: string) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      setError(null);
      await updateMemberRole(
        token,
        workstreamId,
        member.user_id,
        role as never,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update member role",
      );
    }
  };

  const remove = async (member: WorkstreamMember) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      setError(null);
      await removeMember(token, workstreamId, member.user_id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove member");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <aside
        className="ml-auto h-full w-full max-w-md bg-white shadow-xl dark:bg-slate-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Members
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close members"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center gap-3 px-5 py-4"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {(member.display_name || member.email || "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {member.display_name || member.email || member.user_id}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {member.email}
                </p>
              </div>
              {canManage && member.role !== "owner" ? (
                <select
                  value={member.role}
                  onChange={(event) => changeRole(member, event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  {editableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              ) : (
                <RoleBadge role={member.role} />
              )}
              {canManage && member.role !== "owner" && (
                <button
                  type="button"
                  onClick={() => remove(member)}
                  className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
