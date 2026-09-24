import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PlayButton, ensurePulseStyles, PULSE_STYLE_ID } from "./PlayButton";
import * as gameDetailStore from "../../utils/gameDetailStore";
import * as downloadStore from "../../utils/downloadStore";
import * as connectionState from "../../utils/connectionState";
import * as connectionHeartbeat from "../../utils/connectionHeartbeat";
import * as sessionManager from "../../utils/sessionManager";
import * as runningApps from "../../utils/runningApps";
import * as backend from "../../api/backend";
import * as steamShortcuts from "../../utils/steamShortcuts";
import * as metadataPatches from "../../utils/metadataPatches";
import * as toast from "../../utils/toast";
import { emitHostEvent } from "../../test-utils/host-event-bus";
import type { DownloadCompleteEvent, DownloadItem, SyncConflict } from "../../types";

vi.mock("../../utils/gameDetailStore", () => ({
  useGameDetail: vi.fn(),
  refreshSaveStatus: vi.fn(),
}));

vi.mock("../../utils/downloadStore", () => ({
  useDownloads: vi.fn(),
  getDownloadState: vi.fn(() => []),
}));

vi.mock("../../utils/connectionState", async () => {
  const React = await import("react");
  const getRommConnectionState = vi.fn(() => "connected");
  const listeners = new Set<(status: unknown) => void>();
  const onRommConnectionChange = vi.fn((cb: (s: unknown) => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  });
  return {
    getRommConnectionState,
    onRommConnectionChange,
    reportServerReachable: vi.fn(),
    useRommConnectionState: () => {
      const [state, setState] = React.useState(getRommConnectionState());
      React.useEffect(() => onRommConnectionChange((s) => setState(s as string)), []);
      return state;
    },
  };
});

vi.mock("../../utils/connectionHeartbeat", () => ({
  registerConnectionHeartbeat: vi.fn(() => vi.fn()),
  CONNECTION_HEARTBEAT_INTERVAL_MS: 30_000,
}));

vi.mock("../../utils/sessionManager", () => ({
  isSessionActive: vi.fn(() => false),
}));

vi.mock("../../utils/runningApps", () => ({
  isAppRunning: vi.fn(() => false),
}));

vi.mock("../../utils/metadataPatches", () => ({
  updatePlaytimeDisplay: vi.fn(),
}));

vi.mock("../../api/backend", () => ({
  startDownload: vi.fn().mockResolvedValue({ success: true }),
  cancelDownload: vi.fn().mockResolvedValue({ success: true }),
  pauseDownload: vi.fn().mockResolvedValue({ success: true }),
  resumeDownload: vi.fn().mockResolvedValue({ success: true }),
  removeRom: vi.fn().mockResolvedValue({ success: true, prune_lease_token: "tok" }),
  preLaunchSync: vi.fn().mockResolvedValue({ success: true, synced: 1, uploaded: 1, downloaded: 0 }),
  stopRunningGame: vi.fn().mockResolvedValue({ success: true }),
  reconcilePlaytime: vi.fn(() => new Promise(() => {})),
  debugLog: vi.fn(),
  logError: vi.fn(),
  invalidateCachedGameDetail: vi.fn(),
  getSaveSetupInfo: vi.fn(() => new Promise(() => {})),
  getBiosStatus: vi.fn(() => new Promise(() => {})),
  probeReachability: vi.fn().mockResolvedValue({ online: true }),
  getDiscSelection: vi.fn().mockResolvedValue({ multi_disc: false }),
  getVersionList: vi.fn().mockResolvedValue({ multi_version: false }),
  getCachedGameDetail: vi.fn().mockResolvedValue({ found: false }),
  selectDisc: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../../utils/steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../utils/toast", () => ({
  showToast: vi.fn(),
}));

describe("PlayButton", () => {
  const originalSteamClient = (window as unknown as { SteamClient?: unknown }).SteamClient;
  const mockRunGame = vi.fn();

  beforeEach(() => {
    vi.mocked(connectionState.getRommConnectionState).mockReturnValue("connected");
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    vi.mocked(runningApps.isAppRunning).mockReturnValue(false);
    vi.mocked(downloadStore.useDownloads).mockReturnValue([]);
    vi.mocked(backend.reconcilePlaytime).mockImplementation(() => new Promise(() => {}));
    vi.mocked(backend.getSaveSetupInfo).mockImplementation(() => new Promise(() => {}));
    vi.mocked(backend.getBiosStatus).mockImplementation(() => new Promise(() => {}));

    (window as unknown as { SteamClient?: unknown }).SteamClient = {
      Apps: {
        RunGame: mockRunGame,
      },
    };
  });

  afterEach(() => {
    (window as unknown as { SteamClient?: unknown }).SteamClient = originalSteamClient;
    vi.restoreAllMocks();
  });

  it("renders DOWNLOAD when game is not installed and triggers startDownload on click", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: false,
      fsSizeBytes: 1024 * 1024 * 2, // 2 MB
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    const btn = screen.getByRole("button", { name: /DOWNLOAD/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("DOWNLOAD");
    expect(btn).not.toHaveTextContent("2.0 MB");
    expect(screen.getByText("SPACE REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();

    const container = screen
      .getByRole("button", { name: /DOWNLOAD/i })
      .closest(".tender-desktop-play-btn-container") as HTMLElement;
    expect(container.style.paddingBottom).toBe("2px");

    fireEvent.click(btn);

    await waitFor(() => {
      expect(backend.startDownload).toHaveBeenCalledWith(100, false, null, null, false);
    });
  });

  it("disables DOWNLOAD button and displays OFFLINE when connection state is offline", () => {
    vi.mocked(connectionState.getRommConnectionState).mockReturnValue("offline");
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: false,
      fsSizeBytes: null,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    const btn = screen.getByRole("button", { name: /OFFLINE/i });
    expect(btn).toBeDisabled();
  });

  it("displays download progress bar, formatted bytes, and cancel button when transfer is active", () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: false,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    const mockItem: DownloadItem = {
      rom_id: 100,
      rom_name: "Super Mario World",
      platform_name: "snes",
      file_name: "smw.sfc",
      status: "downloading",
      progress: 50,
      bytes_downloaded: 500,
      total_bytes: 1000,
      resumable: true,
    };
    vi.mocked(downloadStore.useDownloads).mockReturnValue([mockItem]);

    render(<PlayButton appId={123} />);

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute("aria-valuenow", "50");

    const cancelBtn = screen.getByRole("button", { name: /cancel download/i });
    expect(cancelBtn).toBeInTheDocument();

    fireEvent.click(cancelBtn);
    expect(backend.cancelDownload).toHaveBeenCalledWith(100);

    const pauseBtn = screen.getByRole("button", { name: /pause download/i });
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);
    expect(backend.pauseDownload).toHaveBeenCalledWith(100);

    const group = progressBar.closest(".tender-desktop-play-btn-group");
    expect(group).toHaveClass("tender-desktop-dl-pulsing");
    expect(group?.getAttribute("style")).toContain("overflow: visible");
  });

  it("ensurePulseStyles injects @keyframes tender-desktop-dl-pulse into target document", () => {
    const customDoc = document.implementation.createHTMLDocument("TestPulse");
    expect(customDoc.getElementById(PULSE_STYLE_ID)).toBeNull();
    ensurePulseStyles(customDoc);
    const styleEl = customDoc.getElementById(PULSE_STYLE_ID);
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("tender-desktop-dl-pulse");
    expect(styleEl?.textContent).toContain("tender-desktop-dl-pulsing");
    expect(styleEl?.textContent).toContain("#tender-desktop-play-button-host");
    expect(styleEl?.textContent).toContain(".romm-status-dot");
    expect(styleEl?.textContent).toContain("StatusAndStats");
    expect(styleEl?.textContent).toContain("LastPlayed");
    expect(styleEl?.textContent).toContain("RightControls");
    expect(styleEl?.textContent).toContain("margin-left: auto");

    // Calling it again is a no-op
    ensurePulseStyles(customDoc);
    expect(customDoc.querySelectorAll(`#${PULSE_STYLE_ID}`)).toHaveLength(1);
  });

  it("displays extracting status during post-download decompression", () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "PlayStation Game",
      platformSlug: "psx",
      installed: false,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    const mockItem: DownloadItem = {
      rom_id: 100,
      rom_name: "PlayStation Game",
      platform_name: "psx",
      file_name: "game.zip",
      status: "extracting",
      progress: 75,
      bytes_downloaded: 750,
      total_bytes: 1000,
      resumable: false,
    };
    vi.mocked(downloadStore.useDownloads).mockReturnValue([mockItem]);

    render(<PlayButton appId={123} />);

    expect(screen.getByText(/Extracting… 75%/i)).toBeInTheDocument();
  });

  it("handles download completion event and transitions to READY", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: false,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    act(() => {
      emitHostEvent<[DownloadCompleteEvent]>("download_complete", {
        rom_id: 100,
        rom_name: "Super Mario World",
        platform_name: "snes",
        file_path: "/roms/smw.sfc",
        app_id: 123,
        launch_options: "run-smw",
      });
    });

    expect(steamShortcuts.setLaunchOptionsConfirmed).toHaveBeenCalledWith(123, "run-smw");
    expect(backend.invalidateCachedGameDetail).toHaveBeenCalledWith(123);
    expect(screen.getByText("READY!")).toBeInTheDocument();
  });

  it("renders PLAY when installed, runs preLaunchSync and calls RunGame on click", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: true,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    const playBtn = screen.getByRole("button", { name: /^PLAY/i });
    expect(playBtn).toBeInTheDocument();

    fireEvent.click(playBtn);

    await waitFor(() => {
      expect(backend.preLaunchSync).toHaveBeenCalledWith(100);
      expect(mockRunGame).toHaveBeenCalledWith("123", "", -1, 100);
    });
  });

  it("renders RESUME when session is active or app is running, and allows stopping", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(true);
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    const resumeBtn = screen.getByRole("button", { name: /RESUME/i });
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.click(resumeBtn);
    expect(mockRunGame).toHaveBeenCalledWith("123", "", -1, 100);

    const stopBtn = screen.getByRole("button", { name: /stop game/i });
    expect(stopBtn).toBeInTheDocument();

    fireEvent.click(stopBtn);
    await waitFor(() => {
      expect(backend.stopRunningGame).toHaveBeenCalledWith(100);
    });
  });

  it("allows uninstalling through the dropdown actions menu", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    const menuToggle = screen.getByRole("button", { name: /game options/i });
    fireEvent.click(menuToggle);

    const uninstallBtn = screen.getByRole("button", { name: /uninstall/i });
    expect(uninstallBtn).toBeInTheDocument();

    fireEvent.click(uninstallBtn);

    await waitFor(() => {
      expect(backend.removeRom).toHaveBeenCalledWith(100);
      expect(steamShortcuts.setLaunchOptionsConfirmed).toHaveBeenCalledWith(123, "");
      expect(toast.showToast).toHaveBeenCalledWith("Super Mario World uninstalled");
    });
  });

  it("displays RESOLVE CONFLICT when save status has a conflict", () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: true,
      saveStatus: {
        files: [],
        conflicts: [{ filename: "save.srm", server_updated_at: "100", local_mtime: "200" } as unknown as SyncConflict],
      } as unknown as import("../../types").SaveStatus,
      saveSyncStatus: "conflict",
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    const conflictBtn = screen.getByRole("button", { name: /RESOLVE CONFLICT/i });
    expect(conflictBtn).toBeInTheDocument();
    fireEvent.click(conflictBtn);
    expect(toast.showToast).toHaveBeenCalledWith("Resolve save conflict before playing");
  });

  it("renders LAST PLAYED and PLAYTIME badges and reconciles playtime on view", async () => {
    vi.mocked(backend.reconcilePlaytime).mockResolvedValue({
      total_seconds: 3600,
      session_count: 5,
      last_played: "2026-09-18T10:00:00Z",
      server_query_failed: false,
    });

    (globalThis as unknown as { appStore?: unknown }).appStore = {
      GetAppOverviewByAppID: vi.fn(() => ({
        rt_last_time_played: 0,
        minutes_playtime_forever: 0,
      })),
    };

    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: false,
      fsSizeBytes: 1024 * 1024 * 10,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    expect(screen.getByText("LAST PLAYED")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("PLAYTIME")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("SPACE REQUIRED")).toBeInTheDocument();

    await waitFor(() => {
      expect(backend.reconcilePlaytime).toHaveBeenCalledWith(100);
      expect(metadataPatches.updatePlaytimeDisplay).toHaveBeenCalledWith(123, 3600, false);
    });
  });

  it("updates LAST PLAYED and PLAYTIME reactively on romm_playtime_changed event", async () => {
    const mockOverview = {
      rt_last_time_played: 0,
      minutes_playtime_forever: 0,
    };
    (globalThis as unknown as { appStore?: unknown }).appStore = {
      GetAppOverviewByAppID: vi.fn(() => mockOverview),
    };

    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    expect(screen.getByText("None")).toBeInTheDocument();

    // Now update the overview mock and dispatch the event
    mockOverview.minutes_playtime_forever = 75; // 1h 15m
    mockOverview.rt_last_time_played = Math.floor(Date.now() / 1000); // Today

    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 123 } }));
    });

    await waitFor(() => {
      expect(screen.getByText("1h 15m")).toBeInTheDocument();
      expect(screen.getByText("Today")).toBeInTheDocument();
    });
  });

  it("renders ACHIEVEMENTS badge when raId is present and hides when raId is null", () => {
    const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");

    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: 456,
      achievementEarned: 5,
      achievementTotal: 20,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    const { unmount } = render(<PlayButton appId={123} />);

    expect(screen.getByText("ACHIEVEMENTS")).toBeInTheDocument();
    expect(screen.getByText("5/20")).toBeInTheDocument();

    const cheevoBadge = screen.getByText("ACHIEVEMENTS").closest(".tender-desktop-achievements");
    expect(cheevoBadge).toBeInTheDocument();
    if (cheevoBadge) {
      fireEvent.click(cheevoBadge);
      // No click action should be dispatched
      expect(dispatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: "romm_tab_switch",
          detail: { tab: "achievements" },
        }),
      );
    }

    unmount();

    // raId null -> hidden
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);
    expect(screen.queryByText("ACHIEVEMENTS")).not.toBeInTheDocument();
  });

  it("hides SPACE REQUIRED badge when game is installed", () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1024 * 1024 * 10,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);

    expect(screen.queryByText("SPACE REQUIRED")).not.toBeInTheDocument();
    expect(screen.getByText("LAST PLAYED")).toBeInTheDocument();
    expect(screen.getByText("PLAYTIME")).toBeInTheDocument();
  });

  it("formats LAST PLAYED date adhering to bigpicture date formatting", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    const mockOverview = {
      rt_last_time_played: 0,
      minutes_playtime_forever: 30,
    };
    (globalThis as unknown as { appStore?: unknown }).appStore = {
      GetAppOverviewByAppID: vi.fn(() => mockOverview),
    };

    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    });

    render(<PlayButton appId={123} />);
    // 0 -> Never
    expect(screen.getByText("Never")).toBeInTheDocument();

    // 1. Same day -> Today
    mockOverview.rt_last_time_played = Math.floor(new Date("2025-06-15T10:00:00Z").getTime() / 1000);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 123 } }));
    });
    expect(screen.getByText("Today")).toBeInTheDocument();

    // 2. 1 day ago -> Yesterday
    mockOverview.rt_last_time_played = Math.floor(new Date("2025-06-14T10:00:00Z").getTime() / 1000);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 123 } }));
    });
    expect(screen.getByText("Yesterday")).toBeInTheDocument();

    // 3. 3 days ago -> 3 days ago
    mockOverview.rt_last_time_played = Math.floor(new Date("2025-06-12T10:00:00Z").getTime() / 1000);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 123 } }));
    });
    expect(screen.getByText("3 days ago")).toBeInTheDocument();

    // 4. Same year, older than a week -> "10 Apr"
    mockOverview.rt_last_time_played = Math.floor(new Date("2025-04-10T10:00:00Z").getTime() / 1000);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 123 } }));
    });
    expect(screen.getByText("10 Apr")).toBeInTheDocument();

    // 5. Prior year -> "20 Aug 2024"
    mockOverview.rt_last_time_played = Math.floor(new Date("2024-08-20T10:00:00Z").getTime() / 1000);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent("romm_playtime_changed", { detail: { appId: 123 } }));
    });
    expect(screen.getByText("20 Aug 2024")).toBeInTheDocument();

    vi.useRealTimers();
  });

  describe("SAVE SYNC badge states", () => {
    const baseDetail = {
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    };

    it("displays 'disabled' in grey when saveSyncEnabled is false", () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: false,
      });

      render(<PlayButton appId={123} />);
      const textEl = screen.getByText("disabled");
      expect(textEl).toBeInTheDocument();
      expect(textEl.closest(".tender-desktop-save-sync")).toBeInTheDocument();
    });

    it("displays 'Ready' in green when enabled, online, and not yet synced", async () => {
      vi.mocked(connectionState.getRommConnectionState).mockReturnValue("connected");
      vi.mocked(backend.getSaveSetupInfo).mockResolvedValue({
        has_local_saves: false,
        local_files: [],
        server_slots: [],
        default_slot: "default",
        slot_confirmed: true,
        active_slot: "default",
        recommended_action: "auto_confirm_default",
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: true,
        saveStatus: null,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        const textEl = screen.getByText("Ready");
        expect(textEl).toBeInTheDocument();
      });
    });

    it("displays 'Ready' in green for uninstalled game when online even if recommended_action is show_wizard", async () => {
      vi.mocked(connectionState.getRommConnectionState).mockReturnValue("connected");
      vi.mocked(backend.getSaveSetupInfo).mockResolvedValue({
        has_local_saves: false,
        local_files: [],
        server_slots: [{ slot: "default", count: 1, saves: [], latest_updated_at: null }],
        default_slot: "default",
        slot_confirmed: false,
        active_slot: null,
        recommended_action: "show_wizard",
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        installed: false,
        saveSyncEnabled: true,
        saveStatus: null,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        const textEl = screen.getByText("Ready");
        expect(textEl).toBeInTheDocument();
      });
    });

    it("displays last successful sync time in green when enabled, online, and synced", async () => {
      vi.mocked(connectionState.getRommConnectionState).mockReturnValue("connected");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: true,
        saveStatus: {
          rom_id: 100,
          files: [],
          playtime: {
            total_seconds: 0,
            session_count: 0,
            last_session_start: null,
            last_session_duration_sec: null,
            last_played: null,
          },
          device_id: "dev-1",
          last_sync_check_at: twoHoursAgo,
        },
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Synced 2h ago")).toBeInTheDocument();
      });
    });

    it("displays 'Save Conflict' in yellow when recommended_action is show_wizard", async () => {
      vi.mocked(connectionState.getRommConnectionState).mockReturnValue("connected");
      vi.mocked(backend.getSaveSetupInfo).mockResolvedValue({
        has_local_saves: true,
        local_files: [{ filename: "save.srm", size: 100 }],
        server_slots: [{ slot: "default", count: 1, saves: [], latest_updated_at: null }],
        default_slot: "default",
        slot_confirmed: false,
        active_slot: null,
        recommended_action: "show_wizard",
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: true,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Save Conflict")).toBeInTheDocument();
      });
    });

    it("displays sync time in yellow when offline and a local save exists", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      vi.mocked(connectionState.getRommConnectionState).mockReturnValue("offline");
      vi.mocked(backend.getSaveSetupInfo).mockResolvedValue({
        has_local_saves: true,
        local_files: [{ filename: "save.srm", size: 100 }],
        server_slots: [],
        default_slot: "default",
        slot_confirmed: true,
        active_slot: "default",
        recommended_action: "server_unreachable",
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: true,
        saveStatus: {
          rom_id: 100,
          files: [
            {
              filename: "save.srm",
              local_path: "/saves/save.srm",
              local_hash: null,
              local_mtime: twoHoursAgo,
              local_size: 100,
              server_save_id: null,
              server_file_name: null,
              server_emulator: null,
              server_updated_at: null,
              server_size: null,
              last_sync_at: twoHoursAgo,
              status: "synced",
            },
          ],
          playtime: {
            total_seconds: 0,
            session_count: 0,
            last_session_start: null,
            last_session_duration_sec: null,
            last_played: null,
          },
          device_id: "dev-1",
          last_sync_check_at: twoHoursAgo,
        },
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Synced 2h ago")).toBeInTheDocument();
      });
    });

    it("displays 'RomM unavailable' in red when offline and no local save exists", async () => {
      vi.mocked(connectionState.getRommConnectionState).mockReturnValue("offline");
      vi.mocked(backend.getSaveSetupInfo).mockResolvedValue({
        has_local_saves: false,
        local_files: [],
        server_slots: [],
        default_slot: "default",
        slot_confirmed: true,
        active_slot: "default",
        recommended_action: "server_unreachable",
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: true,
        saveStatus: null,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("RomM Unavailable")).toBeInTheDocument();
      });
    });

    it("switches to emulation-settings tab on click", () => {
      const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        saveSyncEnabled: true,
      });

      render(<PlayButton appId={123} />);
      const saveSyncBadge = screen.getByText("SAVE SYNC").closest(".tender-desktop-save-sync");
      expect(saveSyncBadge).toBeInTheDocument();
      if (saveSyncBadge) {
        fireEvent.click(saveSyncBadge);
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "romm_tab_switch",
            detail: { tab: "emulation-settings" },
          }),
        );
      }
    });
  });

  describe("BIOS Checker badge states", () => {
    const baseDetail = {
      romId: 100,
      romName: "Super Mario World",
      platformSlug: "snes",
      installed: true,
      fsSizeBytes: 1000,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
      activeSlot: "default",
      raId: null,
      achievementEarned: 0,
      achievementTotal: 0,
      biosNeeded: false,
      biosLabel: "",
      biosRequiredMissing: false,
      activeCoreLabel: null,
      activeCoreIsDefault: true,
      emulators: [],
      emulatorDataAvailable: true,
      platformCoreLabel: null,
      hasGameOverride: false,
    };

    it("displays 'Ready (no BIOS)' in green when firmware is not needed", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: null,
        bios_level: null,
        bios_label: null,
        bios_status_unknown: false,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: false,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Ready (no BIOS)")).toBeInTheDocument();
      });
    });

    it("displays 'Ready (no BIOS)' in green when firmware is optional and not installed", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: {
          needs_bios: true,
          platform_slug: "gba",
          server_count: 1,
          local_count: 0,
          all_downloaded: false,
          required_count: 0,
          required_downloaded: 0,
        },
        bios_level: "ok",
        bios_label: "BIOS optional",
        bios_status_unknown: false,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: true,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Ready (no BIOS)")).toBeInTheDocument();
      });
    });

    it("displays 'Ready' in green when firmware is needed and correctly installed", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: {
          needs_bios: true,
          platform_slug: "psx",
          server_count: 1,
          local_count: 1,
          all_downloaded: true,
          required_count: 1,
          required_downloaded: 1,
        },
        bios_level: "ok",
        bios_label: "BIOS present",
        bios_status_unknown: false,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: true,
        biosRequiredMissing: false,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Ready")).toBeInTheDocument();
      });
    });

    it("displays 'Error, see below' in red when firmware required is missing", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: {
          needs_bios: true,
          platform_slug: "psx",
          server_count: 1,
          local_count: 0,
          all_downloaded: false,
          required_count: 1,
          required_downloaded: 0,
        },
        bios_level: "missing",
        bios_label: "BIOS missing",
        bios_status_unknown: false,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: true,
        biosRequiredMissing: true,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Error, see below")).toBeInTheDocument();
      });
    });

    it("displays 'Unknown' in grey when bios_level is unknown and no required files are missing", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: {
          needs_bios: true,
          platform_slug: "ps2",
          server_count: 2,
          local_count: 2,
          all_downloaded: true,
          required_count: 0,
          required_downloaded: 0,
        },
        bios_level: "unknown",
        bios_label: "Unknown",
        bios_status_unknown: false,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: true,
        biosRequiredMissing: false,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        const textEl = screen.getByText("Unknown");
        expect(textEl).toBeInTheDocument();
        expect(textEl.closest(".tender-desktop-bios")).toHaveTextContent("Unknown");
      });
    });

    it("displays 'unknown' in grey when bios_status_unknown is true", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: null,
        bios_level: null,
        bios_label: "",
        bios_status_unknown: true,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: false,
        biosRequiredMissing: false,
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        const textEl = screen.getByText("Unknown");
        expect(textEl).toBeInTheDocument();
        expect(textEl.closest(".tender-desktop-bios")).toHaveTextContent("Unknown");
      });
    });

    it("displays 'Partial' in amber when bios_level is partial and no required files are missing", async () => {
      vi.mocked(backend.getBiosStatus).mockResolvedValue({
        bios_status: {
          needs_bios: true,
          platform_slug: "ps2",
          server_count: 2,
          local_count: 1,
          all_downloaded: false,
          required_count: 0,
          required_downloaded: 0,
        },
        bios_level: "partial",
        bios_label: "Partial",
        bios_status_unknown: false,
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        ...baseDetail,
        biosNeeded: true,
        biosRequiredMissing: false,
        biosLabel: "Partial",
      });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(screen.getByText("Partial")).toBeInTheDocument();
      });
    });

    it("switches to emulation-settings tab on click", () => {
      const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue(baseDetail);

      render(<PlayButton appId={123} />);
      const biosBadge = screen.getByText("BIOS").closest(".tender-desktop-bios");
      expect(biosBadge).toBeInTheDocument();
      if (biosBadge) {
        fireEvent.click(biosBadge);
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "romm_tab_switch",
            detail: { tab: "emulation-settings" },
          }),
        );
      }
    });
  });

  describe("connection heartbeat & reachability", () => {
    it("registers connection heartbeat on mount and unregisters on unmount", () => {
      const stopHeartbeat = vi.fn();
      vi.mocked(connectionHeartbeat.registerConnectionHeartbeat).mockReturnValue(stopHeartbeat);

      const { unmount } = render(<PlayButton appId={123} />);
      expect(connectionHeartbeat.registerConnectionHeartbeat).toHaveBeenCalled();

      unmount();
      expect(stopHeartbeat).toHaveBeenCalled();
    });

    it("probes reachability on mount and reports to connectionState", async () => {
      vi.mocked(backend.probeReachability).mockResolvedValue({ online: false });

      render(<PlayButton appId={123} />);

      await waitFor(() => {
        expect(backend.probeReachability).toHaveBeenCalled();
        expect(connectionState.reportServerReachable).toHaveBeenCalledWith(false);
      });
    });

    it("reacts live when onRommConnectionChange notifies of offline transition", async () => {
      let listener: ((status: connectionState.RommConnectionState) => void) | null = null;
      vi.mocked(connectionState.onRommConnectionChange).mockImplementation((cb) => {
        listener = cb;
        return () => {};
      });
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        romId: 100,
        romName: "Super Mario World",
        platformSlug: "snes",
        installed: false,
        fsSizeBytes: null,
        saveSyncEnabled: false,
        saveStatus: null,
        saveSyncStatus: null,
        saveSyncLabel: "",
        savefilesInContentDir: false,
        activeSlot: "default",
        raId: null,
        achievementEarned: 0,
        achievementTotal: 0,
        biosNeeded: false,
        biosLabel: "",
        biosRequiredMissing: false,
        activeCoreLabel: null,
        activeCoreIsDefault: true,
        emulators: [],
        emulatorDataAvailable: true,
        platformCoreLabel: null,
        hasGameOverride: false,
      });

      render(<PlayButton appId={123} />);

      expect(screen.getByRole("button", { name: /DOWNLOAD/i })).not.toBeDisabled();

      act(() => {
        listener?.("offline");
      });

      await waitFor(() => {
        const btn = screen.getByRole("button", { name: /OFFLINE/i });
        expect(btn).toBeDisabled();
      });
    });

    it("renders DiscSelector alongside PLAY button when game is installed and multi-disc", async () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        romId: 100,
        romName: "Final Fantasy VII",
        platformSlug: "psx",
        installed: true,
        fsSizeBytes: 1024,
        saveSyncEnabled: false,
        saveStatus: null,
        saveSyncStatus: null,
        saveSyncLabel: "",
        savefilesInContentDir: false,
        activeSlot: "default",
        raId: null,
        achievementEarned: 0,
        achievementTotal: 0,
        biosNeeded: false,
        biosLabel: "",
        biosRequiredMissing: false,
        activeCoreLabel: "Beetle PSX",
        activeCoreIsDefault: true,
        emulators: [],
        emulatorDataAvailable: true,
        platformCoreLabel: "Beetle PSX",
        hasGameOverride: false,
      });

      vi.mocked(backend.getCachedGameDetail).mockResolvedValue({
        found: true,
        rom_id: 100,
        rom_name: "Final Fantasy VII",
        installed: true,
      });

      vi.mocked(backend.getDiscSelection).mockResolvedValue({
        multi_disc: true,
        discs: [
          { filename: "ff7 (Disc 1).cue", label: "Disc 1", index: 1 },
          { filename: "ff7 (Disc 2).cue", label: "Disc 2", index: 2 },
        ],
        selected: null,
        default: { kind: "m3u", label: "All discs (m3u)", filename: "ff7.m3u" },
      });

      render(<PlayButton appId={123} />);

      expect(screen.getByRole("button", { name: /PLAY/i })).toBeInTheDocument();
      expect(await screen.findByTestId("disc-btn")).toBeInTheDocument();
    });
  });
});
