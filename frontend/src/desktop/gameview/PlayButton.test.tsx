import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PlayButton, ensurePulseStyles, PULSE_STYLE_ID } from "./PlayButton";
import * as gameDetailStore from "../../utils/gameDetailStore";
import * as downloadStore from "../../utils/downloadStore";
import * as connectionState from "../../utils/connectionState";
import * as sessionManager from "../../utils/sessionManager";
import * as runningApps from "../../utils/runningApps";
import * as backend from "../../api/backend";
import * as steamShortcuts from "../../utils/steamShortcuts";
import * as toast from "../../utils/toast";
import { emitDeckyEvent } from "../../test-utils/decky-api-mock";
import type { DownloadItem, SyncConflict } from "../../types";

vi.mock("../../utils/gameDetailStore", () => ({
  useGameDetail: vi.fn(),
  refreshSaveStatus: vi.fn(),
}));

vi.mock("../../utils/downloadStore", () => ({
  useDownloads: vi.fn(),
  getDownloadState: vi.fn(() => []),
}));

vi.mock("../../utils/connectionState", () => ({
  getRommConnectionState: vi.fn(() => "connected"),
  onRommConnectionChange: vi.fn(() => vi.fn()),
}));

vi.mock("../../utils/sessionManager", () => ({
  isSessionActive: vi.fn(() => false),
}));

vi.mock("../../utils/runningApps", () => ({
  isAppRunning: vi.fn(() => false),
}));

vi.mock("../../api/backend", () => ({
  startDownload: vi.fn().mockResolvedValue({ success: true }),
  cancelDownload: vi.fn().mockResolvedValue({ success: true }),
  pauseDownload: vi.fn().mockResolvedValue({ success: true }),
  resumeDownload: vi.fn().mockResolvedValue({ success: true }),
  removeRom: vi.fn().mockResolvedValue({ success: true, prune_lease_token: "tok" }),
  preLaunchSync: vi.fn().mockResolvedValue({ success: true, synced: 1, uploaded: 1, downloaded: 0 }),
  stopRunningGame: vi.fn().mockResolvedValue({ success: true }),
  debugLog: vi.fn(),
  logError: vi.fn(),
  invalidateCachedGameDetail: vi.fn(),
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
      emitDeckyEvent("download_complete", {
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
});
