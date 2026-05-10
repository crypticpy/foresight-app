/**
 * Chat API barrel.
 *
 * The previous monolith was decomposed into `lib/chat/<feature>` modules.
 * This file preserves the public import surface so consumers keep using
 * `from "../lib/chat-api"` unchanged. Reach into the sub-modules directly
 * if you only need a focused slice of the surface.
 *
 * @module lib/chat-api
 */

export * from "./chat/shared";
export * from "./chat/streaming";
export * from "./chat/conversations";
export * from "./chat/suggestions";
export * from "./chat/mentions";
export * from "./chat/messages";
