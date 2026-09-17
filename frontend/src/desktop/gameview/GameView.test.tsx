import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GameView, GameViewPage } from "./GameView";
import * as gameDetailStore from "../../utils/gameDetailStore";
import * as sharedReads from "../../api/sharedReads";
import * as desktopWin from "../desktopWindow";
import * as artwork from "../../utils/artwork";
import type { RomMetadata } from "../../types";

vi.mock("../../utils/gameDetailStore", () => ({
  useGameDetail: vi.fn(),
}));

vi.mock("../../api/sharedReads", () => ({
  getRomMetadataShared: vi.fn(),
}));

vi.mock("../desktopWindow", () => ({
  coverCandidates: vi.fn(),
}));

vi.mock("../../utils/artwork", () => ({
  applyArtwork: vi.fn().mockResolvedValue(4),
  cancelArtworkApply: vi.fn().mockResolvedValue(undefined),
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

  it("renders the About header and game details with loaded metadata", async () => {
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

    expect(screen.getByText("About")).toBeInTheDocument();
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

    expect(screen.getByText("About")).toBeInTheDocument();
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
    expect(screen.getByText("About")).toBeInTheDocument();

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
});
