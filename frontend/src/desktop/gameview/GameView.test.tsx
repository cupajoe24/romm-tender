import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { GameView } from "./GameView";
import * as gameDetailStore from "../../utils/gameDetailStore";
import * as sharedReads from "../../api/sharedReads";
import * as desktopWin from "../desktopWindow";
import * as artwork from "../../utils/artwork";
import * as connectionHeartbeat from "../../utils/connectionHeartbeat";
import { setMigrationStatus, clearMigration } from "../../utils/migrationStore";
import { setPlaytimeScopeState } from "../../utils/playtimeScopeStore";
import * as sessionManager from "../../utils/sessionManager";
import * as backend from "../../api/backend";
import type { RomMetadata } from "../../types";

vi.mock("../../api/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/backend")>();
  return {
    ...actual,
    debugLog: vi.fn(),
    getPlaytimeScopeNotice: vi.fn().mockResolvedValue({ pending: false }),
  };
});

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
  getGameIconUrl: vi.fn().mockResolvedValue(null),
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
    setPlaytimeScopeState({ pending: false });
    vi.mocked(desktopWin.coverCandidates).mockReturnValue(["https://steamloopback.host/custom/cover.jpg"]);
    (window as unknown as { appStore?: unknown }).appStore = {
      GetAppOverviewByAppID: vi.fn().mockReturnValue({ display_name: "Mario Golf: Advance Tour" }),
    };
  });

  afterEach(() => {
    cleanup();
    (window as unknown as { appStore?: unknown }).appStore = originalAppStore;
    vi.restoreAllMocks();
  });

  it("renders game details, emulation settings, and saves on a single page with loaded metadata", async () => {
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
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getAllByText("Mario Golf: Advance Tour").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Saves")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Mocked RPG Summary")).toBeInTheDocument();
      expect(screen.getByText("Camelot")).toBeInTheDocument();
    });
  });

  it("displays the platform display name instead of the platform slug when platformName is provided", async () => {
    vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
      romId: 42,
      romName: "Mario Golf (USA)",
      platformSlug: "gba",
      platformName: "Gameboy Advance",
      installed: true,
      fsSizeBytes: null,
      saveSyncEnabled: false,
      saveStatus: null,
      saveSyncStatus: null,
      saveSyncLabel: "",
      savefilesInContentDir: false,
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

    await waitFor(() => {
      expect(screen.getByText("Gameboy Advance")).toBeInTheDocument();
      expect(screen.getByText("GAMEBOY ADVANCE EMULATION")).toBeInTheDocument();
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
    expect(screen.getAllByText("Fallback ROM Name").length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getAllByText("App 77777").length).toBeGreaterThanOrEqual(1);
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

  it("renders Game Info in the left column (2/3) and Emulation Settings in the right column (1/3) simultaneously", async () => {
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

    const { container } = render(<GameView appId={101} />);

    // No tabs exist
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    // Both Game Info and Emulation Settings are visible simultaneously
    expect(screen.getAllByText("Mario Golf: Advance Tour").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("N64 EMULATION")).toBeInTheDocument();
    expect(screen.getByText("Active Core")).toBeInTheDocument();
    expect(screen.getAllByText("Mupen64Plus-Next").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Saves")).toBeInTheDocument();

    // Left and right columns contain respective content
    const leftColumn = container.querySelector(".tender-desktop-left-column");
    const rightColumn = container.querySelector(".tender-desktop-right-column");
    expect(leftColumn).toBeInTheDocument();
    expect(rightColumn).toBeInTheDocument();
    expect(leftColumn?.querySelector(".tender-desktop-about-card")).toBeInTheDocument();
    expect(leftColumn?.querySelector(".tender-desktop-emulation-card")).toBeInTheDocument();
    expect(rightColumn?.querySelector(".tender-desktop-saves-card")).toBeInTheDocument();

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

  it("registers connection heartbeat on mount and unregisters on unmount", () => {
    const stopHeartbeat = vi.fn();
    vi.mocked(connectionHeartbeat.registerConnectionHeartbeat).mockReturnValue(stopHeartbeat);

    const { unmount } = render(<GameView appId={12345} />);
    expect(connectionHeartbeat.registerConnectionHeartbeat).toHaveBeenCalled();

    unmount();
    expect(stopHeartbeat).toHaveBeenCalled();
  });

  it("structures outer cards container and two-column layout (2/3 left, 1/3 right)", async () => {
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
      expect(screen.getAllByText("Mario Golf: Advance Tour").length).toBeGreaterThanOrEqual(1);
    });
    const outerContainer = container.querySelector(".tender-desktop-cards-container");
    expect(outerContainer).toBeInTheDocument();
    const columnsContainer = container.querySelector<HTMLElement>(".tender-desktop-columns-container");
    expect(columnsContainer).toBeInTheDocument();
    expect(outerContainer?.contains(columnsContainer)).toBe(true);

    const leftCol = container.querySelector<HTMLElement>(".tender-desktop-left-column");
    const rightCol = container.querySelector<HTMLElement>(".tender-desktop-right-column");
    expect(leftCol).toBeInTheDocument();
    expect(rightCol).toBeInTheDocument();
    expect(columnsContainer?.contains(leftCol)).toBe(true);
    expect(columnsContainer?.contains(rightCol)).toBe(true);
    expect(columnsContainer?.style.display).toBe("grid");
    expect(columnsContainer?.style.gridTemplateColumns).toBe("2fr 1fr");
  });

  it("renders AchievementsCard in right column when raId is present and skips when absent", async () => {
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
      raId: 999,
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

    const { container, rerender } = render(<GameView appId={12345} />);
    await waitFor(() => {
      expect(screen.getAllByText("Mario Golf: Advance Tour").length).toBeGreaterThanOrEqual(1);
    });
    expect(
      container.querySelector(".tender-desktop-right-column .tender-desktop-achievements-card"),
    ).toBeInTheDocument();

    // Absent raId skips rendering achievements card
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
    rerender(<GameView appId={12345} />);
    expect(container.querySelector(".tender-desktop-achievements-card")).not.toBeInTheDocument();
  });

  describe("RetroDECK Path Migration Alert", () => {
    afterEach(() => {
      cleanup();
      clearMigration();
    });
    it("does not render MigrationBlockedCard when migration is not pending", () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        romId: null,
        romName: "Mario Golf (USA)",
        platformSlug: "gba",
        installed: true,
        fsSizeBytes: null,
        saveSyncEnabled: false,
        saveStatus: null,
        saveSyncStatus: null,
        saveSyncLabel: "",
        savefilesInContentDir: false,
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

      const { container } = render(<GameView appId={12345} />);

      expect(container.querySelector(".tender-desktop-migration-card")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("renders MigrationBlockedCard atop GameView when migration is pending", () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        romId: null,
        romName: "Mario Golf (USA)",
        platformSlug: "gba",
        installed: true,
        fsSizeBytes: null,
        saveSyncEnabled: false,
        saveStatus: null,
        saveSyncStatus: null,
        saveSyncLabel: "",
        savefilesInContentDir: false,
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

      setMigrationStatus({ pending: true });

      const { container } = render(<GameView appId={12345} />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(screen.getByText("RetroDECK Migration Required")).toBeInTheDocument();
      expect(
        screen.getByText("Open the plugin QAM to migrate files or dismiss the migration before playing."),
      ).toBeInTheDocument();

      const alertContainer = container.querySelector(".tender-desktop-migration-alert-container");
      const columnsContainer = container.querySelector(".tender-desktop-columns-container");
      expect(alertContainer).toBeInTheDocument();
      expect(columnsContainer).toBeInTheDocument();
      expect(
        Boolean(
          alertContainer &&
          columnsContainer &&
          alertContainer.compareDocumentPosition(columnsContainer) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);
    });

    it("dynamically shows and hides MigrationBlockedCard when store state transitions", () => {
      vi.mocked(gameDetailStore.useGameDetail).mockReturnValue({
        romId: null,
        romName: "Mario Golf (USA)",
        platformSlug: "gba",
        installed: true,
        fsSizeBytes: null,
        saveSyncEnabled: false,
        saveStatus: null,
        saveSyncStatus: null,
        saveSyncLabel: "",
        savefilesInContentDir: false,
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

      clearMigration();
      render(<GameView appId={12345} />);

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      act(() => {
        setMigrationStatus({ pending: true });
      });

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("RetroDECK Migration Required")).toBeInTheDocument();

      act(() => {
        clearMigration();
      });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("renders PlaytimeScopeBanner when cross-device playtime scope notice is pending", async () => {
      vi.mocked(backend.getPlaytimeScopeNotice).mockResolvedValue({ pending: true });
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

      render(<GameView appId={12345} />);

      await waitFor(() => {
        expect(screen.getByTestId("desktop-playtime-scope-banner")).toBeInTheDocument();
      });
      expect(screen.getByText("Cross-device playtime")).toBeInTheDocument();
      expect(screen.getByText("Sign in again to enable cross-device playtime sync.")).toBeInTheDocument();
    });

    it("renders ActiveSessionBanner when an active session is detected for the game", async () => {
      vi.mocked(backend.getPlaytimeScopeNotice).mockResolvedValue({ pending: false });
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

      vi.spyOn(sessionManager, "isSessionActive").mockReturnValue(true);
      setPlaytimeScopeState({ pending: false });
      render(<GameView appId={12345} />);

      await waitFor(() => {
        expect(screen.getByTestId("desktop-active-session-banner")).toBeInTheDocument();
      });
      expect(screen.getByText("Active Session in Progress")).toBeInTheDocument();
    });
  });
});
