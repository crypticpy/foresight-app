/**
 * useCommandPaletteTagActions tests — covers the debounce window,
 * min-query-length gate, stale-result guarding, and the
 * navigate-on-activate shape of the produced CommandAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCommandPaletteTagActions } from "../useCommandPaletteTagActions";
import * as tagsApi from "../../lib/tags-api";

const FAKE_TOKEN = "tkn";
const getAuthToken = async () => FAKE_TOKEN;

function tag(slug: string, label = slug) {
  return {
    id: `id-${slug}`,
    slug,
    label,
    created_by: null,
    created_at: "2026-05-19T00:00:00Z",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useCommandPaletteTagActions", () => {
  it("returns no actions for empty query", async () => {
    const search = vi.spyOn(tagsApi, "searchTags").mockResolvedValue({
      tags: [],
    });
    const navigate = vi.fn();
    const { result } = renderHook(() =>
      useCommandPaletteTagActions("", navigate, getAuthToken),
    );
    expect(result.current).toEqual([]);
    // Below the min-query-length gate — no API call.
    expect(search).not.toHaveBeenCalled();
  });

  it("returns no actions for a single-character query (below min length)", () => {
    const search = vi.spyOn(tagsApi, "searchTags");
    const navigate = vi.fn();
    renderHook(() => useCommandPaletteTagActions("c", navigate, getAuthToken));
    expect(search).not.toHaveBeenCalled();
  });

  it("debounces — does not call the API until after the debounce window", async () => {
    const search = vi
      .spyOn(tagsApi, "searchTags")
      .mockResolvedValue({ tags: [tag("climate")] });
    const navigate = vi.fn();
    renderHook(() =>
      useCommandPaletteTagActions("climate", navigate, getAuthToken),
    );
    // Before the debounce window elapses, no fetch.
    expect(search).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(FAKE_TOKEN, "climate", 6);
  });

  it("maps tag hits to navigate actions targeting /tags/:slug", async () => {
    vi.spyOn(tagsApi, "searchTags").mockResolvedValue({
      tags: [tag("climate", "Climate"), tag("housing", "Housing")],
    });
    const navigate = vi.fn();
    const { result } = renderHook(() =>
      useCommandPaletteTagActions("cli", navigate, getAuthToken),
    );
    // advanceTimersByTimeAsync flushes the debounce timer AND the
    // pending microtasks queued by the awaited searchTags promise.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    expect(result.current).toHaveLength(2);

    const first = result.current[0]!;
    expect(first.id).toBe("tag:climate");
    expect(first.name).toBe("Browse tag: Climate");

    first.onActivate();
    expect(navigate).toHaveBeenCalledWith("/tags/climate");
  });

  it("clears previous results when query drops below min length", async () => {
    vi.spyOn(tagsApi, "searchTags").mockResolvedValue({
      tags: [tag("climate")],
    });
    const navigate = vi.fn();
    const { result, rerender } = renderHook(
      ({ q }) => useCommandPaletteTagActions(q, navigate, getAuthToken),
      { initialProps: { q: "climate" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    expect(result.current).toHaveLength(1);

    rerender({ q: "" });
    expect(result.current).toEqual([]);
  });

  it("makes no API call and produces no actions when getAuthToken returns null", async () => {
    const search = vi.spyOn(tagsApi, "searchTags");
    const navigate = vi.fn();
    const getNullToken = async () => null;
    const { result } = renderHook(() =>
      useCommandPaletteTagActions("climate", navigate, getNullToken),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    expect(search).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it("encodeURIComponent-safe slug paths", async () => {
    vi.spyOn(tagsApi, "searchTags").mockResolvedValue({
      tags: [tag("with space")],
    });
    const navigate = vi.fn();
    const { result } = renderHook(() =>
      useCommandPaletteTagActions("with", navigate, getAuthToken),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    expect(result.current).toHaveLength(1);

    result.current[0]!.onActivate();
    expect(navigate).toHaveBeenCalledWith("/tags/with%20space");
  });
});
