/**
 * Ownership predicates for the Workstreams list page. These keep the section
 * partitioning (Strategic / My / Shared) in one place so the rendering code
 * stays simple.
 *
 * @module pages/Workstreams/ownership
 */

import type { Workstream } from "../../components/WorkstreamForm";
import { WORKSTREAM_OWNER_TYPE } from "../../types/workstream";

export const isOrgOwnedWorkstream = (
  workstream: Pick<Workstream, "owner_type">,
) => workstream.owner_type === WORKSTREAM_OWNER_TYPE.ORG;

export const isUserOwnedWorkstream = (
  workstream: Pick<Workstream, "owner_type">,
) => !isOrgOwnedWorkstream(workstream);

export const isMyWorkstream = (workstream: Workstream) =>
  isUserOwnedWorkstream(workstream) &&
  (!workstream.role || workstream.role === "owner");

export const isSharedWorkstream = (workstream: Workstream) =>
  isUserOwnedWorkstream(workstream) &&
  Boolean(workstream.role) &&
  workstream.role !== "owner";
