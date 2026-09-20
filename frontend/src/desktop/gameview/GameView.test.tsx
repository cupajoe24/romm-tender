import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { GameView, GameViewPage } from "./GameView";
import * as gameDetailStore from "../../utils/gameDetailStore";
import * as sharedReads from "../../api/sharedReads";
import * as desktopWin from "../desktopWindow";
import * as artwork from "../../utils/artwork";
import * as connectionHeartbeat from "../../utils/connectionHeartbeat";
import type { RomMetadata } from "../../types";

vi.mock("../../utils/gameDetailStore", () => ({
  useGameDetail: vi.fn(),
}));

vi.mock("../../api/sharedReads", () => ({
  getRomMetadataShared: vi.fn(),
}));

vi.mock("../desktopWindow", () => ({
  coverCandidates: vi.fn(),
  findDesktopWindow: vi.fn(),
}));

vi.mock("../../utils/artwork", () => ({
  applyArtwork: vi.fn().mockResolvedValue(4),
  cancelArtworkApply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/connectionHeartbeat", () => ({
  registerConnectionHeartbeat: vi.fn(() => vi.fn()),
  CONNECTION_HEARTBEAT_INTERVAL_MS: 30_000,
}));

describe("GameView", () => {
  const originalAppStore = (window as unknown as { appStore?: unknown }).appStore;

  const mockMetadata: RomMetadata = {
    summary: "Mocked RPG Summary",
    genres: ["RPG"],
    companies: ["Camelot"],
    first_release_date: 1082592000,
    average_rating: 90,
    game_modes: ["Single player"],
    player_count: "1",
    cached_at: 1000,
  };

  beforeEach(() => {
    vi.mocked(desktopWin.coverCandidates).mockReturnValue(["https://steamloopback.host/custom/cover.jpg"]);
    (window as unknown as { appStore?: unknown }).appStore = {
      GetAppOverviewByAppID: vi.fn().mockReturnValue({ display_name: "Mario Golf: Advance Tour" }),
    };
  });

  afterEach(() => {
    (window as unknown as { appStore?: unknown }).appStore = originalAppStore;
    vi.restoreAllMocks();
  });

  it("exports GameViewPage as an alias to GameView", () => {
    expect(GameViewPage).toBe(GameView);
  });

  it("renders the navigation tab bar and game details with loaded metadata", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 42,
      romName: "Mario Golf (USA)",
      platformSlug: "gba",
      installed: true,
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

    vi.mocked(sharedReads.getRomMetadataShared).mockResolvedValue(mockMetadata);

    render(<GameView appId={12345} />);

    expect(screen.queryByText("About")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Game Info" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Emulation Settings" })).toBeInTheDocument();
    expect(screen.getByText("Mario Golf: Advance Tour")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Mocked RPG Summary")).toBeInTheDocument();
      expect(screen.getByText("Camelot")).toBeInTheDocument();
    });
  });

  it("falls back to romName and handles null metadata when romId is missing or metadata fetch fails", async () => {
    delete (window as unknown as { appStore?: unknown }).appStore;

    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: null,
      romName: "Fallback ROM Name",
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

    render(<GameView appId={99999} />);

    expect(screen.getByRole("tab", { name: "Game Info" })).toBeInTheDocument();
    expect(screen.getByText("Fallback ROM Name")).toBeInTheDocument();
    expect(screen.getByText("snes")).toBeInTheDocument();
  });

  it("falls back to 'App <appId>' when overview and romName are both absent", () => {
    delete (window as unknown as { appStore?: unknown }).appStore;

    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: null,
      romName: "",
      platformSlug: "",
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

    render(<GameView appId={77777} />);
    expect(screen.getByText("App 77777")).toBeInTheDocument();
  });

  it("handles metadata rejection gracefully", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 88,
      romName: "Error ROM",
      platformSlug: "nes",
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

    vi.mocked(sharedReads.getRomMetadataShared).mockRejectedValue(new Error("Network failure"));

    render(<GameView appId={88888} />);
    expect(screen.getByRole("tab", { name: "Game Info" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Mocked RPG Summary")).not.toBeInTheDocument();
    });
  });

  it("triggers applyArtwork when romId is present and cancels on unmount", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 999,
      romName: "Zelda",
      platformSlug: "n64",
      installed: true,
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

    const { unmount } = render(<GameView appId={55555} />);

    await waitFor(() => {
      expect(vi.mocked(artwork.applyArtwork)).toHaveBeenCalledWith(999, 55555);
    });

    unmount();

    expect(vi.mocked(artwork.cancelArtworkApply)).toHaveBeenCalledWith(55555);
  });

  it("switches view when clicking between Game Info and Emulator Settings tabs", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 101,
      romName: "Star Fox 64",
      platformSlug: "n64",
      installed: true,
      fsSizeBytes: null,
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
      activeCoreLabel: "Mupen64Plus-Next",
      activeCoreIsDefault: true,
      emulators: [
        {
          label: "Mupen64Plus-Next",
          kind: "libretro",
          core_so: "mupen64plus_next",
          emulator: "mupen64plus_next",
          is_default: true,
          bakeable: true,
          reason: null,
        },
      ],
      emulatorDataAvailable: true,
      platformCoreLabel: "Mupen64Plus-Next",
      hasGameOverride: false,
    });

    vi.mocked(sharedReads.getRomMetadataShared).mockResolvedValue(mockMetadata);

    render(<GameView appId={101} />);

    // Default tab is Game Info
    expect(screen.getByRole("tab", { name: "Game Info" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Mario Golf: Advance Tour")).toBeInTheDocument();

    // Click Emulation Settings tab
    const emuTab = screen.getByRole("tab", { name: "Emulation Settings" });
    fireEvent.click(emuTab);

    expect(emuTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("N64 EMULATION")).toBeInTheDocument();
    expect(screen.getByText("Active Core")).toBeInTheDocument();
    expect(screen.getAllByText("Mupen64Plus-Next").length).toBeGreaterThanOrEqual(1);

    // Click back to Game Info tab
    const gameInfoTab = screen.getByRole("tab", { name: "Game Info" });
    fireEvent.click(gameInfoTab);

    expect(gameInfoTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("N64 EMULATION")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(vi.mocked(artwork.applyArtwork)).toHaveBeenCalledWith(101, 101);
    });
  });

  it("renders PlayButton when showPlayButton is true", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 42,
      romName: "Mario Golf (USA)",
      platformSlug: "gba",
      installed: true,
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
    vi.mocked(sharedReads.getRomMetadataShared).mockResolvedValue(mockMetadata);

    render(<GameView appId={12345} showPlayButton />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /PLAY/i })).toBeInTheDocument();
    });
  });

  it("switches to emulation-settings tab when romm_tab_switch event is dispatched", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 42,
      romName: "Mario Golf (USA)",
      platformSlug: "gba",
      installed: true,
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
    vi.mocked(sharedReads.getRomMetadataShared).mockResolvedValue(mockMetadata);

    render(<GameView appId={12345} />);

    const emuTab = screen.getByRole("tab", { name: "Emulation Settings" });
    expect(emuTab).toHaveAttribute("aria-selected", "false");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("romm_tab_switch", {
          detail: { tab: "emulation-settings" },
        }),
      );
    });

    await waitFor(() => {
      expect(emuTab).toHaveAttribute("aria-selected", "true");
    });
  });

  it("registers connection heartbeat on mount and unregisters on unmount", () => {
    const stopHeartbeat = vi.fn();
    vi.mocked(connectionHeartbeat.registerConnectionHeartbeat).mockReturnValue(stopHeartbeat);

    const { unmount } = render(<GameView appId={12345} />);
    expect(connectionHeartbeat.registerConnectionHeartbeat).toHaveBeenCalled();

    unmount();
    expect(stopHeartbeat).toHaveBeenCalled();
  });

  it("structures outer cards container, tab switcher, and tab content container", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 42,
      romName: "Mario Golf (USA)",
      platformSlug: "gba",
      installed: true,
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
    vi.mocked(sharedReads.getRomMetadataShared).mockResolvedValue(mockMetadata);

    const { container } = render(<GameView appId={12345} />);
    await waitFor(() => {
      expect(screen.getByText("Mario Golf: Advance Tour")).toBeInTheDocument();
    });
    const outerContainer = container.querySelector(".tender-desktop-cards-container");
    expect(outerContainer).toBeInTheDocument();
    const tabContainer = container.querySelector(".tender-desktop-tab-container");
    expect(tabContainer).toBeInTheDocument();
    expect(outerContainer?.contains(tabContainer)).toBe(true);
  });
});
