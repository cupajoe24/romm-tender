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
import { RESUME_TARGET_OCCUPIED_TOAST } from "../../utils/adoptWording";
import type { GameDetailState } from "../../utils/gameDetailStore";
import type {
  AdoptionCandidate,
  AdoptResult,
  DownloadCompleteEvent,
  DownloadItem,
  SaveStatus,
  SyncConflict,
  TargetOccupiedResult,
} from "../../types";

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

vi.mock("../../api/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/backend")>();
  return {
    isCallableFailure: actual.isCallableFailure,
    isTargetOccupied: actual.isTargetOccupied,
    isCandidatesFound: actual.isCandidatesFound,
    isUnusableNamesake: actual.isUnusableNamesake,
    isCandidateVanished: actual.isCandidateVanished,
    isRenameCollisions: actual.isRenameCollisions,
    adoptExistingRom: vi.fn(),
    verifyExistingContent: vi.fn(),
    getSaveStatus: vi.fn(),
    resolveSyncConflict: vi.fn(),
    ...BACKEND_STUBS,
  };
});

const BACKEND_STUBS = vi.hoisted(() => ({
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
  getAchievementProgress: vi.fn().mockResolvedValue({ success: false, earned: 0, total: 0, earned_achievements: [] }),
  getAchievements: vi.fn().mockResolvedValue({ success: false, total: 0, achievements: [] }),
}));

vi.mock("../../utils/steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../utils/toast", () => ({
  showToast: vi.fn(),
}));

const CONFLICT: SyncConflict = {
  type: "sync_conflict",
  rom_id: 100,
  filename: "smw.srm",
  server_save_id: 7,
  server_updated_at: "2026-01-02T00:00:00Z",
  server_size: 2048,
  local_path: "/saves/smw.srm",
  local_hash: "abc",
  local_mtime: "2026-01-01T00:00:00Z",
  local_size: 1024,
  created_at: "2026-01-01T00:00:00Z",
};

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
    vi.mocked(backend.getAchievementProgress).mockResolvedValue({
      success: false,
      earned: 0,
      total: 0,
      earned_achievements: [],
    });
    vi.mocked(backend.getAchievements).mockResolvedValue({ success: false, total: 0, achievements: [] });

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
      emitHostEvent<DownloadCompleteEvent>("download_complete", {
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

  it("displays RESOLVE CONFLICT when save status has a conflict, and opens the dialog on it", async () => {
    vi.mocked(backend.preLaunchSync).mockClear();
    const known = { ...CONFLICT, filename: "save.srm" };
    vi.mocked(backend.getSaveStatus).mockResolvedValue({
      rom_id: 100,
      files: [],
      conflicts: [known],
    } as unknown as import("../../types").SaveStatus);
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
    expect(await screen.findByRole("dialog", { name: "Save conflict for save.srm" })).toBeInTheDocument();
    expect(backend.getSaveStatus).toHaveBeenCalledWith(100);
    expect(backend.preLaunchSync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /RESOLVE CONFLICT/i })).toBeInTheDocument();
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
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "romm_open_achievements_modal",
          detail: { romId: 100 },
        }),
      );
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "romm_tab_switch",
          detail: { tab: "game-info" },
        }),
      );
      // Confirms no invalid "achievements" tab switch is sent
      expect(dispatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: "romm_tab_switch",
          detail: { tab: "achievements" },
        }),
      );

      // Keydown Enter / Space
      fireEvent.keyDown(cheevoBadge, { key: "Enter" });
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "romm_open_achievements_modal",
          detail: { romId: 100 },
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

  it("updates ACHIEVEMENTS badge numbers when romm_achievements_updated event is dispatched", () => {
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
      achievementEarned: 2,
      achievementTotal: 10,
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
    expect(screen.getByText("2/10")).toBeInTheDocument();

    act(() => {
      globalThis.dispatchEvent(
        new CustomEvent("romm_achievements_updated", {
          detail: { romId: 100, earned: 5, total: 10 },
        }),
      );
    });

    expect(screen.getByText("5/10")).toBeInTheDocument();
  });

  it("updates ACHIEVEMENTS badge numbers when getAchievementProgress resolves", async () => {
    vi.mocked(backend.getAchievementProgress).mockResolvedValue({
      success: true,
      earned: 7,
      total: 24,
      earned_achievements: [],
    });

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

    await waitFor(() => {
      expect(screen.getByText("7/24")).toBeInTheDocument();
    });
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

  describe("content already on the device, and save conflicts", () => {
    const OCCUPIED: TargetOccupiedResult = {
      success: false,
      reason: "target_occupied",
      message: "'smw.sfc' is already on this device",
      existing: { name: "smw.sfc", path: "/roms/snes/smw.sfc", kind: "file", size_bytes: 2048, modified_at: 0 },
      incoming: { name: "smw.sfc", size_bytes: 2048 },
      sizes_match: true,
      adoptable: true,
    };

    const CANDIDATE_A: AdoptionCandidate = {
      name: "Super Mario World (USA).sfc",
      path: "/roms/snes/Super Mario World (USA).sfc",
      is_dir: false,
      size_bytes: 2048,
      modified_at: 0,
      evidence: "crc32",
      detail: "Same checksum as the server's copy",
    };
    const CANDIDATE_B: AdoptionCandidate = {
      ...CANDIDATE_A,
      name: "smw-hack.sfc",
      path: "/roms/snes/smw-hack.sfc",
      evidence: "name",
      detail: "Carries this game's name",
    };

    const ADOPTED = {
      success: true,
      message: "",
      app_id: 123,
      launch_options: "run-smw",
      prune_lease_token: null,
    } as unknown as AdoptResult;

    function detailState(overrides: Partial<GameDetailState> = {}): GameDetailState {
      return {
        romId: 100,
        romName: "Super Mario World",
        platformSlug: "snes",
        installed: false,
        fsSizeBytes: 2048,
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
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(backend.getCachedGameDetail).mockResolvedValue({ found: false });
      vi.mocked(backend.startDownload).mockResolvedValue({ success: true } as never);
      vi.mocked(backend.preLaunchSync).mockResolvedValue({
        success: true,
        synced: 0,
        uploaded: 0,
        downloaded: 0,
      } as never);
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue(detailState());
    });

    it("opens the comparison on target_occupied, and adopting writes the launch command and switches to PLAY", async () => {
      vi.mocked(backend.startDownload).mockResolvedValueOnce(OCCUPIED as never);
      vi.mocked(backend.adoptExistingRom).mockResolvedValueOnce(ADOPTED);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /DOWNLOAD/ }));

      const dialog = await screen.findByRole("dialog", { name: "This Game Is Already on Your Device" });
      expect(dialog).toHaveTextContent("Both are the same size.");
      fireEvent.click(screen.getByRole("button", { name: "Use These Files" }));

      expect(await screen.findByRole("button", { name: /^PLAY/ })).toBeInTheDocument();
      expect(backend.adoptExistingRom).toHaveBeenCalledWith(100, null, null);
      expect(steamShortcuts.setLaunchOptionsConfirmed).toHaveBeenCalledWith(123, "run-smw");
      expect(toast.showToast).toHaveBeenCalledWith("Super Mario World is ready to play");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Download Instead asks a second time, and Delete and Download re-sends with replace", async () => {
      vi.mocked(backend.startDownload).mockResolvedValueOnce(OCCUPIED as never);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /DOWNLOAD/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Download Instead" }));

      expect(screen.getByText(/Downloading deletes the file that is here now — smw\.sfc/)).toBeInTheDocument();
      expect(backend.startDownload).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Delete and Download" }));

      await waitFor(() => expect(backend.startDownload).toHaveBeenLastCalledWith(100, true, null, null, false));
      expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    });

    it("dismissing the comparison with Escape leaves the button offering the files it found", async () => {
      vi.mocked(backend.startDownload).mockResolvedValueOnce(OCCUPIED as never);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /DOWNLOAD/ }));
      await screen.findByRole("dialog");
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const button = screen.getByRole("button", { name: "USE EXISTING FILES" });
      expect(button).toBeEnabled();
      expect(backend.adoptExistingRom).not.toHaveBeenCalled();
      expect(backend.startDownload).toHaveBeenCalledTimes(1);
    });

    it("lists two candidates, compares the one picked, and adopts it by its path", async () => {
      vi.mocked(backend.startDownload).mockResolvedValueOnce({
        success: false,
        reason: "adoption_candidates",
        message: "",
        incoming: { name: "smw.sfc", size_bytes: 2048 },
        candidates: [CANDIDATE_A, CANDIDATE_B],
        truncated: false,
      } as never);
      vi.mocked(backend.adoptExistingRom).mockResolvedValueOnce(ADOPTED);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /DOWNLOAD/ }));

      await screen.findByRole("dialog", { name: "This Game May Already Be on Your Device" });
      fireEvent.click(screen.getByRole("button", { name: /smw-hack\.sfc/ }));

      await screen.findByRole("dialog", { name: "This Game Is Already on Your Device" });
      expect(screen.getByText(/Using it renames it to smw\.sfc/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Use These Files" }));

      await waitFor(() => expect(backend.adoptExistingRom).toHaveBeenCalledWith(100, "/roms/snes/smw-hack.sfc", null));
    });

    it("asks once about taken names and re-sends the adopt with the answer", async () => {
      vi.mocked(backend.startDownload).mockResolvedValueOnce(OCCUPIED as never);
      vi.mocked(backend.adoptExistingRom)
        .mockResolvedValueOnce({
          success: false,
          reason: "rename_collisions",
          message: "",
          collisions: [{ name: "smw.srm", path: "/saves/smw.srm", kind: "save" }],
        } as never)
        .mockResolvedValueOnce(ADOPTED);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /DOWNLOAD/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Use These Files" }));

      const collisions = await screen.findByRole("dialog", { name: "Some of These Names Are Taken" });
      expect(collisions).toHaveTextContent("smw.srm (save)");
      fireEvent.click(screen.getByRole("button", { name: "Replace Them" }));

      await waitFor(() => expect(backend.adoptExistingRom).toHaveBeenLastCalledWith(100, null, "overwrite"));
      expect(await screen.findByRole("button", { name: /^PLAY/ })).toBeInTheDocument();
    });

    it("labels the button USE EXISTING FILES from the cached detail, and reports a seen candidate on the press", async () => {
      vi.mocked(backend.getCachedGameDetail).mockResolvedValue({
        found: true,
        rom_id: 100,
        installed: false,
        adoption_candidate_present: true,
      });

      render(<PlayButton appId={123} />);
      fireEvent.click(await screen.findByRole("button", { name: "USE EXISTING FILES" }));

      await waitFor(() => expect(backend.startDownload).toHaveBeenCalledWith(100, false, null, null, true));
    });

    it("keeps DOWNLOAD when the cached detail found nothing", async () => {
      vi.mocked(backend.getCachedGameDetail).mockResolvedValue({
        found: true,
        rom_id: 100,
        installed: false,
        target_path_occupied: false,
        adoption_candidate_present: false,
      });

      render(<PlayButton appId={123} />);
      await waitFor(() => expect(backend.getCachedGameDetail).toHaveBeenCalledWith(123));
      expect(screen.getByRole("button", { name: /DOWNLOAD/ })).toHaveTextContent(/^DOWNLOAD$/);
    });

    it("says why a resume was refused when something now sits at the game's location", async () => {
      vi.mocked(downloadStore.useDownloads).mockReturnValue([
        {
          rom_id: 100,
          rom_name: "Super Mario World",
          platform_name: "snes",
          file_name: "smw.sfc",
          status: "paused",
          progress: 50,
          bytes_downloaded: 1024,
          total_bytes: 2048,
          resumable: true,
        },
      ]);
      vi.mocked(backend.resumeDownload).mockResolvedValueOnce(OCCUPIED as never);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: "Resume download" }));

      await waitFor(() => expect(toast.showToast).toHaveBeenCalledWith(RESUME_TARGET_OCCUPIED_TOAST));
    });

    it("resolves a pre-launch conflict in the dialog, then launches", async () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue(detailState({ installed: true, saveSyncEnabled: true }));
      vi.mocked(backend.preLaunchSync).mockResolvedValueOnce({
        success: true,
        synced: 0,
        uploaded: 0,
        downloaded: 0,
        conflicts: [CONFLICT],
      } as never);
      vi.mocked(backend.resolveSyncConflict).mockResolvedValueOnce({ success: true } as never);
      const announced = vi.fn();
      globalThis.addEventListener("romm_data_changed", announced);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /^PLAY/ }));

      await screen.findByRole("dialog", { name: "Save conflict for smw.srm" });
      expect(mockRunGame).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Use Server" }));

      await waitFor(() => expect(mockRunGame).toHaveBeenCalledWith("123", "", -1, 100));
      expect(backend.resolveSyncConflict).toHaveBeenCalledWith(100, "smw.srm", 7, "use_server");
      expect(toast.showToast).toHaveBeenCalledWith(
        "Conflict resolved — used the server save · your local was backed up.",
      );
      const saveSync = announced.mock.calls.map(([e]) => (e as CustomEvent).detail as { type: string; rom_id: number });
      expect(saveSync).toContainEqual({ type: "save_sync", rom_id: 100 });
      globalThis.removeEventListener("romm_data_changed", announced);
    });

    it("does not launch when the pre-launch conflict is cancelled, and shows RESOLVE CONFLICT", async () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue(detailState({ installed: true, saveSyncEnabled: true }));
      vi.mocked(backend.preLaunchSync).mockResolvedValueOnce({
        success: true,
        synced: 0,
        uploaded: 0,
        downloaded: 0,
        conflicts: [CONFLICT],
      } as never);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /^PLAY/ }));
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(await screen.findByRole("button", { name: /RESOLVE CONFLICT/ })).toBeInTheDocument();
      expect(mockRunGame).not.toHaveBeenCalled();
      expect(backend.resolveSyncConflict).not.toHaveBeenCalled();
      expect(gameDetailStore.refreshSaveStatus).toHaveBeenCalledWith(123);
    });

    it("RESOLVE CONFLICT resolved in the dialog switches the button to PLAY", async () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue(
        detailState({
          installed: true,
          saveSyncEnabled: true,
          saveStatus: { rom_id: 100, files: [], conflicts: [CONFLICT] } as unknown as SaveStatus,
        }),
      );
      vi.mocked(backend.getSaveStatus).mockResolvedValueOnce({
        rom_id: 100,
        files: [],
        conflicts: [CONFLICT],
      } as unknown as SaveStatus);
      vi.mocked(backend.resolveSyncConflict).mockResolvedValueOnce({ success: true } as never);

      render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /RESOLVE CONFLICT/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Keep Local" }));

      expect(await screen.findByRole("button", { name: /^PLAY/ })).toBeInTheDocument();
      expect(backend.resolveSyncConflict).toHaveBeenCalledWith(100, "smw.srm", 7, "keep_local");
      expect(mockRunGame).not.toHaveBeenCalled();
    });

    it("unmounting with the comparison open ends the flow at its cancel exit", async () => {
      vi.mocked(backend.startDownload).mockResolvedValueOnce(OCCUPIED as never);

      const { unmount } = render(<PlayButton appId={123} />);
      fireEvent.click(screen.getByRole("button", { name: /DOWNLOAD/ }));
      await screen.findByRole("dialog");
      unmount();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await act(async () => {});
      expect(backend.startDownload).toHaveBeenCalledTimes(1);
      expect(backend.adoptExistingRom).not.toHaveBeenCalled();
    });
  });
});
