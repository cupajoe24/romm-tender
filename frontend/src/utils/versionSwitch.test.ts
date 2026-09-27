import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reportVersionListReachability,
  loadVersionList,
  fetchVersionCovers,
  executeVersionSwitch,
} from "./versionSwitch";
import * as backend from "../api/backend";
import type { VersionList, VersionInfo } from "../api/backend";
import * as connectionState from "./connectionState";
import * as vanishedBinding from "./vanishedBinding";
import * as versionApp from "./versionSwitchApplication";
import * as toast from "./toast";
import * as pruneLease from "./pruneLease";

vi.mock("../api/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/backend")>()),
  getVersionList: vi.fn(),
  switchVersion: vi.fn(),
  syncRomSaves: vi.fn(),
  refreshSaveStatus: vi.fn().mockResolvedValue(undefined),
  fetchCoverBase64: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./connectionState", () => ({
  reportServerReachable: vi.fn(),
}));

vi.mock("./vanishedBinding", () => ({
  setBoundVanished: vi.fn(),
}));

vi.mock("./versionSwitchApplication", () => ({
  applyCommittedVersionSwitch: vi.fn().mockResolvedValue(true),
}));

vi.mock("./toast", () => ({
  showToast: vi.fn(),
}));

const mockTarget: VersionInfo = {
  rom_id: 2,
  name: "Game (Europe)",
  label: "Europe",
  regions: ["Europe"],
  languages: ["En"],
  revision: "",
  tags: [],
  active: false,
  is_default: false,
  installed: true,
  synced: true,
  vanished: false,
  switchable: true,
};

describe("reportVersionListReachability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports server unreachable when server_query_failed is true", () => {
    reportVersionListReachability({
      multi_version: true,
      server_query_failed: true,
      bound_vanished: false,
      versions: [],
    });
    expect(connectionState.reportServerReachable).toHaveBeenCalledWith(false);
  });

  it("reports server reachable when multi-version and bound is not vanished", () => {
    reportVersionListReachability({
      multi_version: true,
      server_query_failed: false,
      bound_vanished: false,
      versions: [],
    });
    expect(connectionState.reportServerReachable).toHaveBeenCalledWith(true);
  });

  it("does not report reachable when bound is vanished", () => {
    reportVersionListReachability({
      multi_version: true,
      server_query_failed: false,
      bound_vanished: true,
      versions: [],
    });
    expect(connectionState.reportServerReachable).not.toHaveBeenCalled();
  });
});

describe("loadVersionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches list, reports reachability, and publishes bound vanished", async () => {
    const mockList: VersionList = {
      multi_version: true,
      server_query_failed: false,
      bound_vanished: true,
      versions: [mockTarget],
    };
    vi.mocked(backend.getVersionList).mockResolvedValueOnce(mockList);

    const result = await loadVersionList(100);
    expect(result).toBe(mockList);
    expect(backend.getVersionList).toHaveBeenCalledWith(100);
    expect(vanishedBinding.setBoundVanished).toHaveBeenCalledWith(100, true);
  });
});

describe("fetchVersionCovers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches covers for unrequested versions and dedupes", async () => {
    vi.mocked(backend.fetchCoverBase64).mockResolvedValue({ base64: "test-base64" });
    const requested = new Set<number>([1]);
    const onCover = vi.fn();

    const cleanup = fetchVersionCovers([mockTarget], requested, onCover);
    await Promise.resolve();
    await Promise.resolve();

    expect(requested.has(2)).toBe(true);
    expect(backend.fetchCoverBase64).toHaveBeenCalledWith(2);
    expect(onCover).toHaveBeenCalledWith(2, "test-base64");
    cleanup();
  });

  it("ignores response if cleanup function is called before resolve", async () => {
    let resolveCover!: (val: { base64: string }) => void;
    vi.mocked(backend.fetchCoverBase64).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveCover = res;
        }),
    );
    const requested = new Set<number>();
    const onCover = vi.fn();

    const cleanup = fetchVersionCovers([mockTarget], requested, onCover);
    cleanup();
    resolveCover({ base64: "test-base64" });
    await Promise.resolve();

    expect(onCover).not.toHaveBeenCalled();
  });
});

describe("executeVersionSwitch", () => {
  const leaseOwner = "version-picker:100";
  const askUnsyncedSaves = vi.fn();
  const setSwitching = vi.fn();
  const onCoverResolved = vi.fn();
  const onVanishedRefusal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    pruneLease.mountPruneLeasePlugin();
    pruneLease.mountPruneLeaseOwner(leaseOwner);
  });

  it("no-ops if target is active, vanished, or not switchable", async () => {
    const activeTarget = { ...mockTarget, active: true };
    const r1 = await executeVersionSwitch({
      appId: 100,
      target: activeTarget,
      leaseOwner,
      askUnsyncedSaves,
    });
    expect(r1.success).toBe(false);
    expect(backend.switchVersion).not.toHaveBeenCalled();

    const vanishedTarget = { ...mockTarget, vanished: true };
    const r2 = await executeVersionSwitch({
      appId: 100,
      target: vanishedTarget,
      leaseOwner,
      askUnsyncedSaves,
    });
    expect(r2.success).toBe(false);

    const unswitchableTarget = { ...mockTarget, switchable: false };
    const r3 = await executeVersionSwitch({
      appId: 100,
      target: unswitchableTarget,
      leaseOwner,
      askUnsyncedSaves,
    });
    expect(r3.success).toBe(false);
  });

  it("switches version successfully without soft-block", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: true,
      app_id: 100,
      rom_id: 2,
      target_installed: true,
      launch_options: "run",
    });

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
      onCoverResolved,
    });

    expect(result).toEqual({ success: true });
    expect(setSwitching).toHaveBeenCalledWith(true);
    // setSwitching(false) must NOT be called on success
    expect(setSwitching).not.toHaveBeenCalledWith(false);
    expect(backend.switchVersion).toHaveBeenCalledWith(100, 2, false);
    expect(versionApp.applyCommittedVersionSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
      onCoverResolved,
      expect.any(Object),
    );
  });

  it("warns user if shortcut confirm fails on successful switch", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: true,
      app_id: 100,
      rom_id: 2,
      target_installed: true,
      launch_options: "run",
    });
    vi.mocked(versionApp.applyCommittedVersionSwitch).mockResolvedValueOnce(false);

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
    });

    expect(result).toEqual({ success: true });
    expect(toast.showToast).toHaveBeenCalledWith("Switched — re-switch if launch fails");
  });

  it("handles soft-block unsynced saves when user cancels", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "unsynced_saves",
      message: "Unsynced saves",
      unsynced_rom_id: 1,
      unsynced_version_name: "Game (USA)",
      server_reachable: true,
    });
    askUnsyncedSaves.mockResolvedValueOnce("cancel");

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
    });

    expect(result).toEqual({ success: false, cancelled: true });
    expect(connectionState.reportServerReachable).toHaveBeenCalledWith(true);
    expect(setSwitching).toHaveBeenCalledWith(false);
    expect(backend.switchVersion).toHaveBeenCalledTimes(1);
  });

  it("handles soft-block unsynced saves when user forces switch_anyway", async () => {
    vi.mocked(backend.switchVersion)
      .mockResolvedValueOnce({
        success: false,
        reason: "unsynced_saves",
        message: "Unsynced saves",
        unsynced_rom_id: 1,
        unsynced_version_name: "Game (USA)",
        server_reachable: true,
      })
      .mockResolvedValueOnce({
        success: true,
        app_id: 100,
        rom_id: 2,
        target_installed: true,
        launch_options: "run",
      });
    askUnsyncedSaves.mockResolvedValueOnce("switch_anyway");

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
    });

    expect(result).toEqual({ success: true });
    expect(backend.switchVersion).toHaveBeenNthCalledWith(1, 100, 2, false);
    expect(backend.switchVersion).toHaveBeenNthCalledWith(2, 100, 2, true);
    expect(versionApp.applyCommittedVersionSwitch).toHaveBeenCalled();
  });

  it("handles soft-block sync_and_switch successfully", async () => {
    vi.mocked(backend.switchVersion)
      .mockResolvedValueOnce({
        success: false,
        reason: "unsynced_saves",
        message: "Unsynced saves",
        unsynced_rom_id: 1,
        unsynced_version_name: "Game (USA)",
        server_reachable: true,
      })
      .mockResolvedValueOnce({
        success: true,
        app_id: 100,
        rom_id: 2,
        target_installed: true,
        launch_options: "run",
      });
    askUnsyncedSaves.mockResolvedValueOnce("sync_and_switch");
    vi.mocked(backend.syncRomSaves).mockResolvedValueOnce({
      success: true,
      message: "ok",
      synced: 1,
      conflicts: [],
    });

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
    });

    expect(result).toEqual({ success: true });
    expect(backend.syncRomSaves).toHaveBeenCalledWith(1);
    expect(backend.switchVersion).toHaveBeenNthCalledWith(2, 100, 2, false);
  });

  it("handles soft-block sync_and_switch when sync fails", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "unsynced_saves",
      message: "Unsynced saves",
      unsynced_rom_id: 1,
      unsynced_version_name: "Game (USA)",
      server_reachable: true,
    });
    askUnsyncedSaves.mockResolvedValueOnce("sync_and_switch");
    vi.mocked(backend.syncRomSaves).mockResolvedValueOnce({
      success: false,
      message: "failed",
      synced: 0,
    });

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
    });

    expect(result).toEqual({ success: false });
    expect(toast.showToast).toHaveBeenCalledWith("Couldn't sync saves — try again");
    expect(backend.refreshSaveStatus).toHaveBeenCalledWith(1);
    expect(setSwitching).toHaveBeenCalledWith(false);
  });

  it("handles soft-block sync_and_switch when conflicts exist", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "unsynced_saves",
      message: "Unsynced saves",
      unsynced_rom_id: 1,
      unsynced_version_name: "Game (USA)",
      server_reachable: true,
    });
    askUnsyncedSaves.mockResolvedValueOnce("sync_and_switch");
    vi.mocked(backend.syncRomSaves).mockResolvedValueOnce({
      success: true,
      message: "conflicts",
      synced: 0,
      conflicts: [{ filename: "save1.srm" } as never],
    });

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
    });

    expect(result).toEqual({ success: false });
    expect(toast.showToast).toHaveBeenCalledWith("Resolve save conflicts first");
    expect(backend.refreshSaveStatus).toHaveBeenCalledWith(1);
    expect(setSwitching).toHaveBeenCalledWith(false);
  });

  it("handles generic switch failure and reports unreachable if server_unreachable", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "server_unreachable",
      message: "Host down",
    });

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
    });

    expect(result).toEqual({ success: false, reason: "server_unreachable" });
    expect(connectionState.reportServerReachable).toHaveBeenCalledWith(false);
    expect(toast.showToast).toHaveBeenCalledWith("Could not switch version", { subtext: "Host down" });
    expect(setSwitching).toHaveBeenCalledWith(false);
  });

  it("invokes onVanishedRefusal when target version vanished", async () => {
    vi.mocked(backend.switchVersion).mockResolvedValueOnce({
      success: false,
      reason: "version_vanished",
      message: "ROM 404",
    });

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      onVanishedRefusal,
    });

    expect(result).toEqual({ success: false, reason: "version_vanished" });
    expect(onVanishedRefusal).toHaveBeenCalled();
  });

  it("handles teardown cancellation silently", async () => {
    const error = new pruneLease.PruneLeaseAdmissionCancelled("unmounted");
    vi.mocked(backend.switchVersion).mockRejectedValueOnce(error);

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      logTag: "TestSwitch",
    });

    expect(result).toEqual({ success: false, cancelled: true });
    expect(backend.logWarn).toHaveBeenCalledWith(
      expect.stringContaining("TestSwitch: version switch continuation was cancelled"),
    );
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("handles unexpected error by toasting and clearing switching", async () => {
    vi.mocked(backend.switchVersion).mockRejectedValueOnce(new Error("Crash"));

    const result = await executeVersionSwitch({
      appId: 100,
      target: mockTarget,
      leaseOwner,
      askUnsyncedSaves,
      setSwitching,
      logTag: "TestSwitch",
    });

    expect(result).toEqual({ success: false });
    expect(backend.logError).toHaveBeenCalledWith(expect.stringContaining("TestSwitch: switchVersion failed"));
    expect(toast.showToast).toHaveBeenCalledWith("Could not switch version");
    expect(setSwitching).toHaveBeenCalledWith(false);
  });
});
