import { useCallback } from "react";
import { useAuthContext } from "./useAuthContext";
import type { Workstream, WorkstreamRole } from "../types/workstream";
import { WORKSTREAM_OWNER_TYPE } from "../types/workstream";

export type AccountType = "paid" | "guest";

export interface WorkstreamCapabilities {
  role: WorkstreamRole | null;
  canRead: boolean;
  canComment: boolean;
  canEditBoard: boolean;
  canManage: boolean;
}

export function useCapabilities() {
  const { profile } = useAuthContext();
  const accountType: AccountType = profile?.account_type || "paid";
  const isGuest = accountType === "guest";

  const forWorkstream = useCallback(
    (workstream?: Pick<Workstream, "role" | "owner_type"> | null): WorkstreamCapabilities => {
      const role =
        workstream?.role ||
        (workstream?.owner_type === WORKSTREAM_OWNER_TYPE.ORG ? "org_viewer" : null);
      return {
        role,
        canRead: Boolean(role),
        canComment: role === "owner" || role === "admin" || role === "editor" || role === "commenter",
        canEditBoard: !isGuest && (role === "owner" || role === "admin" || role === "editor"),
        canManage: !isGuest && (role === "owner" || role === "admin"),
      };
    },
    [isGuest],
  );

  return {
    accountType,
    canCreateWorkstream: !isGuest,
    canRunResearch: !isGuest,
    canExport: !isGuest,
    forWorkstream,
  };
}
