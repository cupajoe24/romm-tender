import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayLaunch } from "./usePlayLaunch";
import * as backend from "../../api/backend";
import * as toast from "../../utils/toast";
import * as sessionManager from "../../utils/sessionManager";
import * as runningApps from "../../utils/runningApps";
import * as runningGame from "../../utils/runningGame";

vi.mock("../../api/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/backend")>();
  return {
    ...actual,
    preLaunchSync: vi.fn().mockResolvedValue({ success: true }),
    stopRunningGame: vi.fn().mockResolvedValue({ success: true, stopped: 1, force_killed: 0 }),
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
    getInstalledRom: vi.fn().mockResolvedValue({ launchable: true }),
  };
});

vi.mock("../../utils/toast", () => ({
  showToast: vi.fn(),
}));

vi.mock("../../utils/pruneLease", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/pruneLease")>();
  return {
    ...actual,
    capturePruneLeaseAdmission: vi.fn(() => ({ pluginGeneration: 1 })),
    isPruneLeaseAdmissionCurrent: vi.fn(() => true),
    withPruneLease: vi.fn(async (_tok: string, _ctx: string, fn: (signal: { aborted: boolean }) => Promise<void>) =>
      fn({ aborted: false }),
    ),
  };
});

vi.mock("../../utils/runningApps", () => ({
  isAppRunning: vi.fn(() => false),
}));

vi.mock("../../utils/sessionManager", () => ({
  isSessionActive: vi.fn(() => false),
}));

vi.mock("../../utils/runningGame", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/runningGame")>();
  return {
    ...actual,
    activateRunningApp: vi.fn(),
  };
});

vi.mock("../../utils/steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../utils/launchOptionsReconcile", () => ({
  reconfirmLaunchOptions: vi.fn().mockResolvedValue({ status: "confirmed" }),
}));

vi.mock("../../utils/steamOverview", () => ({
  overviewFor: vi.fn(() => ({
    GetGameID: () => "12345",
  })),
}));

describe("usePlayLaunch", () => {
  const ask = vi.fn();
  const setStateOverride = vi.fn();
  const holdVerdict = vi.fn();
  const setShowMenu = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    vi.mocked(runningApps.isAppRunning).mockReturnValue(false);
  });

  it("stops running game when handleStopClick is called on an active session", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(true);

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

  it("self-heals stale overlay on handleStopClick when nothing is running", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    vi.mocked(runningApps.isAppRunning).mockReturnValue(false);

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

    expect(backend.stopRunningGame).not.toHaveBeenCalled();
    expect(setStateOverride).toHaveBeenCalledWith(null);
  });

  it("activates running app when handlePlayClick is called on an active session", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(true);

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
      await result.current.handlePlayClick();
    });

    expect(runningGame.activateRunningApp).toHaveBeenCalledWith(12345, "DesktopPlayButton");
    expect(backend.preLaunchSync).not.toHaveBeenCalled();
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
    expect(setStateOverride).toHaveBeenCalledWith("download");
  });

  it("handles failed uninstall by resetting state override to null", async () => {
    vi.mocked(backend.removeRom).mockResolvedValueOnce({ success: false, message: "Failed" });

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
    expect(toast.showToast).toHaveBeenCalledWith("Failed");
    expect(setStateOverride).toHaveBeenCalledWith(null);
  });

  it("surfaces core-change confirmation and aborts launch when user cancels", async () => {
    vi.mocked(backend.checkCoreChange).mockResolvedValueOnce({
      changed: true,
      old_label: "PCSX ReARMed",
      new_label: "DuckStation",
    });
    // User cancels the dialog
    ask.mockResolvedValueOnce(false);

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
      await result.current.handlePlayClick();
    });

    expect(backend.checkCoreChange).toHaveBeenCalledWith(100);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(setStateOverride).toHaveBeenCalledWith(null);
    expect(backend.preLaunchSync).not.toHaveBeenCalled();
  });

  it("surfaces core-change confirmation and proceeds with launch when user confirms", async () => {
    vi.mocked(backend.checkCoreChange).mockResolvedValueOnce({
      changed: true,
      old_label: "PCSX ReARMed",
      new_label: "DuckStation",
    });
    // User confirms the dialog
    ask.mockResolvedValueOnce(true);

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
      await result.current.handlePlayClick();
    });

    expect(backend.checkCoreChange).toHaveBeenCalledWith(100);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(backend.preLaunchSync).toHaveBeenCalledWith(100);
  });
});
