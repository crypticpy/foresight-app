/**
 * Discovery API barrel.
 *
 * The previous monolith was decomposed into `lib/discovery/<feature>` modules.
 * This file preserves the public import surface so consumers keep using
 * `from "../lib/discovery-api"` unchanged. Reach into the sub-modules directly
 * if you only need a focused slice of the surface.
 *
 * @module lib/discovery-api
 */

export * from "./discovery/shared";
export * from "./discovery/pending-review";
export * from "./discovery/runs";
export * from "./discovery/search";
export * from "./discovery/saved-searches";
export * from "./discovery/search-history";
export * from "./discovery/personalized";
export * from "./discovery/trends";
export * from "./discovery/card-ops";
