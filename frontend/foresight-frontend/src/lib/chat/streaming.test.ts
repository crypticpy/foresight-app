/**
 * Tests for the SSE stream parser, focused on the error-code path: the
 * UI banner relies on ``[E_CODE] message — detail`` formatting to give
 * the user something concrete to read back to support.
 */

import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { parseSSEStream } from "./streaming";

function makeResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(evt));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

interface SpyCallbacks {
  onToken: Mock;
  onCitation: Mock;
  onSuggestions: Mock;
  onDone: Mock;
  onError: Mock;
  onProgress: Mock;
  onMetadata: Mock;
}

function makeCallbacks(): SpyCallbacks {
  return {
    onToken: vi.fn(),
    onCitation: vi.fn(),
    onSuggestions: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onMetadata: vi.fn(),
  };
}

// vitest's Mock type doesn't structurally match SSECallbacks under strict
// TS, so cast through unknown at the call site rather than re-declaring
// every callback signature inside the test file.
function asCallbacks(cb: SpyCallbacks): Parameters<typeof parseSSEStream>[1] {
  return cb as unknown as Parameters<typeof parseSSEStream>[1];
}

describe("parseSSEStream — error events", () => {
  it("renders [E_CODE] message — detail when all fields are present", async () => {
    const payload = JSON.stringify({
      type: "error",
      code: "E_CHAT_LLM_TIMEOUT",
      content: "The request timed out. Please try a simpler question.",
      detail: "ReadTimeout: HTTPSConnectionPool",
    });
    const res = makeResponse([`data: ${payload}\n\n`]);
    const cb = makeCallbacks();

    await parseSSEStream(res, asCallbacks(cb));

    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalledWith(
      "[E_CHAT_LLM_TIMEOUT] The request timed out. Please try a simpler question. — ReadTimeout: HTTPSConnectionPool",
    );
  });

  it("omits code prefix when the backend did not send one (back-compat)", async () => {
    const payload = JSON.stringify({
      type: "error",
      content: "Legacy error without a code.",
    });
    const res = makeResponse([`data: ${payload}\n\n`]);
    const cb = makeCallbacks();

    await parseSSEStream(res, asCallbacks(cb));

    expect(cb.onError).toHaveBeenCalledWith("Legacy error without a code.");
  });

  it("omits detail suffix when only a code is provided", async () => {
    const payload = JSON.stringify({
      type: "error",
      code: "E_CHAT_QUOTA",
      content: "Chat quota exceeded.",
    });
    const res = makeResponse([`data: ${payload}\n\n`]);
    const cb = makeCallbacks();

    await parseSSEStream(res, asCallbacks(cb));

    expect(cb.onError).toHaveBeenCalledWith(
      "[E_CHAT_QUOTA] Chat quota exceeded.",
    );
  });

  it("falls back to a default message when neither data nor content is present", async () => {
    const payload = JSON.stringify({ type: "error" });
    const res = makeResponse([`data: ${payload}\n\n`]);
    const cb = makeCallbacks();

    await parseSSEStream(res, asCallbacks(cb));

    expect(cb.onError).toHaveBeenCalledWith("Unknown streaming error");
  });
});

describe("parseSSEStream — progress / tool_error", () => {
  it("dispatches a tool_error progress event to onProgress", async () => {
    const payload = JSON.stringify({
      type: "progress",
      data: {
        step: "tool_error",
        tool: "search_signals",
        detail: "Tool 'search_signals' failed: TimeoutError",
      },
    });
    const res = makeResponse([`data: ${payload}\n\n`]);
    const cb = makeCallbacks();

    await parseSSEStream(res, asCallbacks(cb));

    expect(cb.onProgress).toHaveBeenCalledWith({
      step: "tool_error",
      tool: "search_signals",
      detail: "Tool 'search_signals' failed: TimeoutError",
    });
    expect(cb.onError).not.toHaveBeenCalled();
  });
});
