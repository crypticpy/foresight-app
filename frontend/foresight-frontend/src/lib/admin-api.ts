/**
 * Admin API barrel.
 *
 * The previous monolith was decomposed into `lib/admin/<feature>` modules.
 * This file preserves the public import surface so consumers keep using
 * `from "../lib/admin-api"` unchanged. Reach into the sub-modules directly
 * if you only need a focused slice of the surface.
 *
 * @module lib/admin-api
 */

export * from "./admin/overview";
export * from "./admin/users";
export * from "./admin/settings";
export * from "./admin/sources";
export * from "./admin/usage";
export * from "./admin/coverage";
export * from "./admin/discovery-runs";
export * from "./admin/schedules";
