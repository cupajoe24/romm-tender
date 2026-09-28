import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutoArtwork, _resetArtworkAppliedForTests } from "./autoArtwork";
import * as artwork from "./artwork";
import * as backend from "../api/backend";

vi.mock("./artwork", () => ({
  applyArtwork: vi.fn(),
  cancelArtworkApply: vi.fn(),
}));

vi.mock("../api/backend", () => ({
  debugLog: vi.fn(),
}));

describe("useAutoArtwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetArtworkAppliedForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call applyArtwork if romId is null", () => {
    renderHook(() => useAutoArtwork(100, null));
    expect(artwork.applyArtwork).not.toHaveBeenCalled();
  });

  it("calls applyArtwork once per (appId, romId) pair upon mount", async () => {
    vi.mocked(artwork.applyArtwork).mockResolvedValue(4);

    const { rerender } = renderHook(({ appId, romId }) => useAutoArtwork(appId, romId), {
      initialProps: { appId: 100, romId: 42 },
    });

    await waitFor(() => {
      expect(artwork.applyArtwork).toHaveBeenCalledTimes(1);
      expect(artwork.applyArtwork).toHaveBeenCalledWith(42, 100);
    });

    // Re-render with same (appId, romId) does not invoke applyArtwork again
    rerender({ appId: 100, romId: 42 });
    expect(artwork.applyArtwork).toHaveBeenCalledTimes(1);
  });

  it("re-applies artwork when romId changes for the same appId (version switch)", async () => {
    vi.mocked(artwork.applyArtwork).mockResolvedValue(4);

    const { rerender } = renderHook(({ appId, romId }) => useAutoArtwork(appId, romId), {
      initialProps: { appId: 100, romId: 42 },
    });

    await waitFor(() => {
      expect(artwork.applyArtwork).toHaveBeenCalledWith(42, 100);
    });

    // Version switch: romId changes to 43
    rerender({ appId: 100, romId: 43 });

    await waitFor(() => {
      expect(artwork.applyArtwork).toHaveBeenCalledTimes(2);
      expect(artwork.applyArtwork).toHaveBeenCalledWith(43, 100);
    });
  });

  it("logs with debugLog and does not mark as applied if applyArtwork fails, allowing retry on next visit", async () => {
    vi.mocked(artwork.applyArtwork).mockRejectedValue(new Error("network failure"));

    const { unmount } = renderHook(() => useAutoArtwork(100, 42, "CustomAutoArtwork"));

    await waitFor(() => {
      expect(backend.debugLog).toHaveBeenCalledWith(
        expect.stringContaining("CustomAutoArtwork: Error: network failure"),
      );
    });

    unmount();

    // Because it failed, it wasn't recorded as applied, so the next visit will retry
    vi.mocked(artwork.applyArtwork).mockResolvedValue(4);
    renderHook(() => useAutoArtwork(100, 42, "CustomAutoArtwork"));

    await waitFor(() => {
      expect(artwork.applyArtwork).toHaveBeenCalledTimes(2);
    });
  });

  it("cancels in-flight artwork application on unmount", () => {
    const { unmount } = renderHook(() => useAutoArtwork(100, 42));

    expect(artwork.cancelArtworkApply).not.toHaveBeenCalled();

    unmount();

    expect(artwork.cancelArtworkApply).toHaveBeenCalledWith(100);
  });
});
