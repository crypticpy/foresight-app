/**
 * Workstream API barrel.
 *
 * The previous monolith was decomposed into `lib/workstream/<feature>` modules.
 * This file preserves the public import surface so consumers keep using
 * `from "../lib/workstream-api"` unchanged. Reach into the sub-modules
 * directly if you only need a focused slice of the surface.
 *
 * @module lib/workstream-api
 */

export * from "./workstream/shared";
export * from "./workstream/cards";
export * from "./workstream/research";
export * from "./workstream/brief";
export * from "./workstream/bulk-export";
export * from "./workstream/scan";
