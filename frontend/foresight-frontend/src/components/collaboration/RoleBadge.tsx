import type { WorkstreamRole } from "../../types/workstream";

const LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
  org_viewer: "Org",
};

export function RoleBadge({ role }: { role?: WorkstreamRole | string | null }) {
  if (!role) return null;
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {LABELS[role] || role}
    </span>
  );
}
