import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayLaunch } from "./usePlayLaunch";
import * as backend from "../../api/backend";
import * as toast from "../../utils/toast";

vi.mock("../../api/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/backend")>();
  return {
    ...actual,
    preLaunchSync: vi.fn(),
    stopRunningGame: vi.fn().mockResolvedValue({ success: true }),
    removeRom: vi.fn().mockResolvedValue({ success: true, prune_lease_token: "tok" }),
    debugLog: vi.fn(),
    logError: vi.fn(),
    invalidateCachedGameDetail: vi.fn(),
    getSaveSetupInfo: vi.fn(),
    probeReachability: vi.fn().mockResolvedValue({ online: true }),
    checkLocalDrift: vi.fn().mockResolvedValue({ drifted: false, rom_id: 100 }),
    isSaveTrackingConfigured: vi.fn().mockResolvedValue({ configured: true }),
    confirmSlotChoice: vi.fn(),
    checkCoreChange: vi.fn().mockResolvedValue({ changed: false }),
  };
});

vi.mock("../../utils/toast", () => ({
  showToast: vi.fn(),
}));

vi.mock("../../utils/pruneLease", () => ({
  capturePruneLeaseAdmission: vi.fn(() => ({ pluginGeneration: 1 })),
  isPruneLeaseAdmissionCurrent: vi.fn(() => true),
  withPruneLease: vi.fn(async (_tok: string, _ctx: string, fn: (signal: { aborted: boolean }) => Promise<void>) =>
    fn({ aborted: false }),
  ),
}));

vi.mock("../../utils/runningApps", () => ({
  isAppRunning: vi.fn(() => false),
}));

vi.mock("../../utils/sessionManager", () => ({
  isSessionActive: vi.fn(() => false),
}));

vi.mock("../../utils/steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
}));

describe("usePlayLaunch", () => {
  const ask = vi.fn();
  const setStateOverride = vi.fn();
  const holdVerdict = vi.fn();
  const setShowMenu = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops running game when handleStopClick is called", async () => {
    const { result } = renderHook(() =>
      usePlayLaunch({
        appId: 12345,
        romId: 100,
        romName: "Test ROM",
        effectiveState: "running",
        ask,
        leaseOwner: "desktop-play-button:12345",
        setStateOverride,
        holdVerdict,
        setShowMenu,
      }),
    );

    await act(async () => {
      await result.current.handleStopClick();
    });

    expect(backend.stopRunningGame).toHaveBeenCalledWith(100);
    expect(setStateOverride).toHaveBeenCalledWith(null);
  });

  it("uninstalls ROM and clears state when handleUninstallClick succeeds", async () => {
    const { result } = renderHook(() =>
      usePlayLaunch({
        appId: 12345,
        romId: 100,
        romName: "Test Game",
        effectiveState: "play",
        ask,
        leaseOwner: "desktop-play-button:12345",
        setStateOverride,
        holdVerdict,
        setShowMenu,
      }),
    );

    await act(async () => {
      await result.current.handleUninstallClick();
    });

    expect(setShowMenu).toHaveBeenCalledWith(false);
    expect(setStateOverride).toHaveBeenCalledWith("uninstalling");
    expect(backend.removeRom).toHaveBeenCalledWith(100);
    expect(toast.showToast).toHaveBeenCalledWith("Test Game uninstalled");
    expect(setStateOverride).toHaveBeenCalledWith(null);
  });
});
