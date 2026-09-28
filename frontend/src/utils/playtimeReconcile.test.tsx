import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGamePlaytime } from "./playtimeReconcile";
import * as backend from "../api/backend";
import * as metadataPatches from "./metadataPatches";
import * as steamOverview from "./steamOverview";

vi.mock("../api/backend", () => ({
  reconcilePlaytime: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock("./metadataPatches", () => ({
  updatePlaytimeDisplay: vi.fn(),
}));

vi.mock("./steamOverview", () => ({
  overviewFor: vi.fn(),
}));

describe("useGamePlaytime", () => {
  const mockAppId = 12345;
  const mockRomId = 999;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(steamOverview.overviewFor).mockReturnValue({
      appid: mockAppId,
      rt_last_time_played: 0,
      minutes_playtime_forever: 0,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with overview values and does not call reconcilePlaytime if romId is null", () => {
    vi.mocked(steamOverview.overviewFor).mockReturnValue({
      appid: mockAppId,
      rt_last_time_played: 1600000000,
      minutes_playtime_forever: 125,
    } as any);

    const { result } = renderHook(() => useGamePlaytime(mockAppId, null));

    expect(result.current.playtime).toBe("2h 5m");
    expect(result.current.lastPlayed).not.toBe("Never");
    expect(result.current.restoredLastPlayed).toBeNull();
    expect(backend.reconcilePlaytime).not.toHaveBeenCalled();
  });

  it("reconciles playtime when romId is provided and updates restoredLastPlayed and display", async () => {
    vi.mocked(backend.reconcilePlaytime).mockResolvedValue({
      total_seconds: 7200,
      session_count: 3,
      last_played: "2026-09-20T12:00:00Z",
      server_query_failed: false,
    });

    const { result } = renderHook(() => useGamePlaytime(mockAppId, mockRomId, "TestContext"));

    await waitFor(() => {
      expect(backend.reconcilePlaytime).toHaveBeenCalledWith(mockRomId);
      expect(metadataPatches.updatePlaytimeDisplay).toHaveBeenCalledWith(mockAppId, 7200, false);
      expect(result.current.restoredLastPlayed).toBe("2026-09-20T12:00:00Z");
    });
  });

  it("handles deferred reconcile result with debugLog", async () => {
    vi.mocked(backend.reconcilePlaytime).mockResolvedValue({
      success: false,
      reason: "prune_active",
      message: "Prune lease held",
    });

    renderHook(() => useGamePlaytime(mockAppId, mockRomId, "DeferredContext"));

    await waitFor(() => {
      expect(backend.reconcilePlaytime).toHaveBeenCalledWith(mockRomId);
      expect(backend.debugLog).toHaveBeenCalledWith(
        expect.stringContaining("DeferredContext: playtime reconcile deferred: Prune lease held"),
      );
      expect(metadataPatches.updatePlaytimeDisplay).not.toHaveBeenCalled();
    });
  });

  it("re-injects local total when server_query_failed is true without updating restoredLastPlayed", async () => {
    vi.mocked(backend.reconcilePlaytime).mockResolvedValue({
      total_seconds: 1800,
      session_count: 1,
      last_played: "2026-09-10T10:00:00Z",
      server_query_failed: true,
    });

    const { result } = renderHook(() => useGamePlaytime(mockAppId, mockRomId));

    await waitFor(() => {
      expect(backend.reconcilePlaytime).toHaveBeenCalledWith(mockRomId);
      expect(metadataPatches.updatePlaytimeDisplay).toHaveBeenCalledWith(mockAppId, 1800, false);
      expect(result.current.restoredLastPlayed).toBeNull();
    });
  });

  it("handles reconcile error with debugLog without crashing", async () => {
    vi.mocked(backend.reconcilePlaytime).mockRejectedValue(new Error("network failure"));

    renderHook(() => useGamePlaytime(mockAppId, mockRomId, "ErrorContext"));

    await waitFor(() => {
      expect(backend.reconcilePlaytime).toHaveBeenCalledWith(mockRomId);
      expect(backend.debugLog).toHaveBeenCalledWith(
        expect.stringContaining("ErrorContext: playtime reconcile error: Error: network failure"),
      );
      expect(metadataPatches.updatePlaytimeDisplay).not.toHaveBeenCalled();
    });
  });

  it("updates reactively when romm_playtime_changed is dispatched for the matching appId", async () => {
    vi.mocked(backend.reconcilePlaytime).mockResolvedValue({
      total_seconds: 0,
      session_count: 0,
      last_played: null,
      server_query_failed: false,
    });

    const mockOverview = {
      appid: mockAppId,
      rt_last_time_played: 0,
      minutes_playtime_forever: 0,
    };
    vi.mocked(steamOverview.overviewFor).mockImplementation(() => mockOverview as any);

    const { result } = renderHook(() => useGamePlaytime(mockAppId, mockRomId));

    expect(result.current.playtime).toBe("None");

    // Dispatch event for a different app ID - should be ignored
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 99999 } }));
    });
    expect(result.current.playtime).toBe("None");

    // Update overview mock and dispatch for matching appId
    mockOverview.minutes_playtime_forever = 90;
    mockOverview.rt_last_time_played = 1700000000;

    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: mockAppId } }));
    });

    await waitFor(() => {
      expect(result.current.playtime).toBe("1h 30m");
    });
  });

  it("resets state when appId changes", () => {
    const { rerender, result } = renderHook(({ appId, romId }) => useGamePlaytime(appId, romId), {
      initialProps: { appId: 100, romId: null as number | null },
    });

    vi.mocked(steamOverview.overviewFor).mockReturnValue({
      appid: 200,
      rt_last_time_played: 1650000000,
      minutes_playtime_forever: 60,
    } as any);

    rerender({ appId: 200, romId: null });

    expect(result.current.playtime).toBe("1 Hour");
  });
});
