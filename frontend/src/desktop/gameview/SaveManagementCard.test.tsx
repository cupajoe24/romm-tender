import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SaveManagementCard } from "./SaveManagementCard";
import * as backend from "../../api/backend";
import * as connectionState from "../../utils/connectionState";
import * as toast from "../../utils/toast";
import type { GameDetailState } from "../../utils/gameDetailStore";
import type { SaveStatus, SaveSlotSummary, SlotSaveFile, SaveVersionEntry } from "../../types";

vi.mock("../../utils/gameDetailStore", () => ({
  refreshSaveStatus: vi.fn(),
  noteSaveSyncDisplay: vi.fn(),
}));

vi.mock("../../api/backend", () => ({
  getSaveSlots: vi.fn(),
  getSlotSaves: vi.fn(),
  switchSlot: vi.fn(),
  deleteSlot: vi.fn(),
  getSlotDeleteInfo: vi.fn(),
  syncRomSaves: vi.fn(),
  copySaveToSlot: vi.fn(),
  savesListFileVersions: vi.fn(),
  savesRollbackToVersion: vi.fn(),
  getVersionList: vi.fn(),
  checkLocalDrift: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock("../../utils/connectionState", () => ({
  getRommConnectionState: vi.fn(() => "connected"),
  onRommConnectionChange: vi.fn(() => () => {}),
  useRommConnectionState: vi.fn(() => "connected"),
  reportServerReachable: vi.fn(),
}));

vi.mock("../../utils/toast", () => ({
  showToast: vi.fn(),
}));

describe("SaveManagementCard", () => {
  const mockSaveStatus: SaveStatus = {
    rom_id: 42,
    device_id: "steamdeck",
    last_sync_check_at: "2026-06-15T21:04:00Z",
    playtime: {
      total_seconds: 3600,
      session_count: 5,
      last_session_start: null,
      last_session_duration_sec: null,
      last_played: "2026-06-15T21:04:00Z",
    },
    files: [
      {
        filename: "Mario Golf - Advance Tour.srm",
        local_path: "~/retrodeck/saves/gba/Mario Golf - Advance Tour.srm",
        local_size: 65536,
        local_hash: null,
        local_mtime: null,
        server_save_id: 4812,
        server_file_name: "Mario Golf - Advance Tour.srm",
        server_emulator: "mgba",
        server_size: 65536,
        server_updated_at: "2026-06-15T21:04:00Z",
        last_sync_at: "2026-06-15T21:04:00Z",
        uploaded_by_us: true,
        status: "synced",
        is_current: true,
        device_syncs: [
          {
            device_id: "steamdeck",
            device_name: "steamdeck",
            is_current: true,
            last_synced_at: "2026-06-15T21:04:00Z",
          },
        ],
      },
    ],
  };

  const mockSlots: SaveSlotSummary[] = [
    { slot: "default", source: "server", count: 1, latest_updated_at: "2026-06-15T21:04:00Z" },
    { slot: "speedrun", source: "server", count: 2, latest_updated_at: "2026-06-10T12:00:00Z" },
    { slot: "", source: "server", count: 1, latest_updated_at: "2026-06-01T10:00:00Z" },
  ];

  const baseDetail: GameDetailState = {
    romId: 42,
    romName: "Mario Golf",
    platformSlug: "gba",
    installed: true,
    fsSizeBytes: null,
    saveSyncEnabled: true,
    saveStatus: mockSaveStatus,
    saveSyncStatus: "synced",
    saveSyncLabel: "Synced",
    savefilesInContentDir: false,
    activeSlot: "default",
    raId: null,
    achievementEarned: 0,
    achievementTotal: 0,
    biosNeeded: false,
    biosLabel: "",
    biosRequiredMissing: false,
    activeCoreLabel: "mgba",
    activeCoreIsDefault: true,
    emulators: [],
    emulatorDataAvailable: true,
    platformCoreLabel: "mgba",
    hasGameOverride: false,
  };

  beforeEach(() => {
    vi.mocked(backend.getSaveSlots).mockResolvedValue({
      success: true,
      slots: mockSlots,
      active_slot: "default",
    });
    vi.mocked(backend.getVersionList).mockResolvedValue({
      multi_version: false,
      bound_vanished: false,
      versions: [],
    });
    vi.mocked(backend.checkLocalDrift).mockResolvedValue({
      drifted: false,
      rom_id: 42,
    });
    vi.mocked(connectionState.getRommConnectionState).mockReturnValue("connected");
    vi.mocked(connectionState.useRommConnectionState).mockReturnValue("connected");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Saves header with slots count, save sync status, and action buttons", async () => {
    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    expect(screen.getByText("Saves")).toBeInTheDocument();
    expect(screen.getByText("Sync now")).toBeInTheDocument();
    expect(screen.getByText("+ New Slot")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("3 slots · save sync on")).toBeInTheDocument();
    });
  });

  it("renders the slots accordion with active badge, server badge, and save count", async () => {
    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText("default")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("speedrun")).toBeInTheDocument();
      expect(screen.getByText("Legacy")).toBeInTheDocument();
    });
  });

  it("renders active slot files details, metadata, and local path", async () => {
    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getAllByText("Mario Golf - Advance Tour.srm")).toHaveLength(2);
      expect(screen.getByText("64.0 KB")).toBeInTheDocument();
      expect(screen.getByText("Synced")).toBeInTheDocument();
      expect(screen.getByText("~/retrodeck/saves/gba/Mario Golf - Advance Tour.srm")).toBeInTheDocument();
    });
  });

  it("runs manual sync on 'Sync now' click and updates display", async () => {
    vi.mocked(backend.syncRomSaves).mockResolvedValue({
      success: true,
      message: "ok",
      synced: 1,
      uploaded: 1,
      downloaded: 0,
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    const syncBtn = screen.getByText("Sync now");
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(backend.syncRomSaves).toHaveBeenCalledWith(42);
      expect(toast.showToast).toHaveBeenCalledWith("Saves uploaded to RomM");
    });
  });

  it("lazy-loads inactive slot files when expanded", async () => {
    const inactiveSaves: SlotSaveFile[] = [
      {
        id: 777,
        filename: "speedrun.srm",
        emulator: "mgba",
        size: 65536,
        updated_at: "2026-06-10T12:00:00Z",
      },
    ];
    vi.mocked(backend.getSlotSaves).mockResolvedValue({
      success: true,
      slot: "speedrun",
      saves: inactiveSaves,
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText("speedrun")).toBeInTheDocument();
    });

    const speedrunHeader = screen.getByText("speedrun").closest('[role="button"]')!;
    fireEvent.click(speedrunHeader);

    await waitFor(() => {
      expect(backend.getSlotSaves).toHaveBeenCalledWith(42, "speedrun");
      expect(screen.getByText("speedrun.srm")).toBeInTheDocument();
      expect(screen.getByText("Activate Slot")).toBeInTheDocument();
      expect(screen.getByText("Delete Slot")).toBeInTheDocument();
    });
  });

  it("activates an inactive slot on 'Activate Slot' click", async () => {
    vi.mocked(backend.getSlotSaves).mockResolvedValue({
      success: true,
      slot: "speedrun",
      saves: [],
    });
    vi.mocked(backend.switchSlot).mockResolvedValue({
      success: true,
      save_status: mockSaveStatus,
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText("speedrun")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("speedrun").closest('[role="button"]')!);

    await waitFor(() => {
      expect(screen.getByText("Activate Slot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Activate Slot"));

    await waitFor(() => {
      expect(backend.switchSlot).toHaveBeenCalledWith(42, "speedrun");
      expect(toast.showToast).toHaveBeenCalledWith("Switched to slot 'speedrun'");
    });
  });

  it("deletes an inactive slot after confirmation", async () => {
    vi.mocked(backend.getSlotSaves).mockResolvedValue({
      success: true,
      slot: "speedrun",
      saves: [],
    });
    vi.mocked(backend.getSlotDeleteInfo).mockResolvedValue({
      success: true,
      slot: "speedrun",
      source: "server",
      is_active: false,
      server_save_count: 2,
      local_file_count: 1,
    });
    vi.mocked(backend.deleteSlot).mockResolvedValue({
      success: true,
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText("speedrun")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("speedrun").closest('[role="button"]')!);

    await waitFor(() => {
      expect(screen.getByText("Delete Slot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete Slot"));

    await waitFor(() => {
      expect(backend.getSlotDeleteInfo).toHaveBeenCalledWith(42, "speedrun");
      expect(
        screen.getByText("This will permanently delete 2 save(s) from slot 'speedrun' on the RomM server."),
      ).toBeInTheDocument();
    });

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(backend.deleteSlot).toHaveBeenCalledWith(42, "speedrun");
      expect(toast.showToast).toHaveBeenCalledWith("Slot 'speedrun' deleted");
    });
  });

  it("creates a new slot via the '+ New Slot' modal", async () => {
    vi.mocked(backend.switchSlot).mockResolvedValue({
      success: true,
      save_status: mockSaveStatus,
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    const newSlotBtn = screen.getByText("+ New Slot");
    fireEvent.click(newSlotBtn);

    expect(screen.getByText("New Save Slot")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Slot Name (e.g. speedrun, casual)");
    fireEvent.change(input, { target: { value: "casual" } });

    const createBtn = screen.getByText("Create Slot");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(backend.switchSlot).toHaveBeenCalledWith(42, "casual");
      expect(toast.showToast).toHaveBeenCalledWith("Switched to slot 'casual'");
    });
  });

  it("renders Previous Versions table and restores a version on click", async () => {
    const mockVersions: SaveVersionEntry[] = [
      {
        id: 4809,
        emulator: "mgba",
        file_name: "Mario Golf - Advance Tour.srm",
        file_size_bytes: 65536,
        updated_at: "2026-06-12T10:00:00Z",
        uploaded_by_us: true,
        device_syncs: [
          {
            device_id: "steamdeck",
            device_name: "steamdeck",
            is_current: true,
            last_synced_at: "2026-06-12T10:00:00Z",
          },
        ],
      },
    ];

    vi.mocked(backend.savesListFileVersions).mockResolvedValue({
      status: "ok",
      versions: mockVersions,
    });
    vi.mocked(backend.savesRollbackToVersion).mockResolvedValue({
      status: "ok",
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText("Previous Versions")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Previous Versions"));

    await waitFor(() => {
      expect(backend.savesListFileVersions).toHaveBeenCalledWith(42, "default", "Mario Golf - Advance Tour.srm");
      expect(screen.getByText("#4809 · mgba")).toBeInTheDocument();
      expect(screen.getByText("Restore")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Restore"));

    await waitFor(() => {
      expect(backend.savesRollbackToVersion).toHaveBeenCalledWith(42, "default", 4809);
      expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("Save restored"));
    });
  });

  it("copies save to another slot via 'Copy to slot...' modal", async () => {
    vi.mocked(backend.copySaveToSlot).mockResolvedValue({
      status: "ok",
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText("Copy to slot...")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Copy to slot..."));

    expect(screen.getByText("Copy save to slot")).toBeInTheDocument();
    // Eligible target slot: speedrun (excludes default and legacy)
    expect(screen.getByRole("button", { name: "speedrun" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "speedrun" }));

    await waitFor(() => {
      expect(backend.copySaveToSlot).toHaveBeenCalledWith(42, 4812, "speedrun");
      expect(toast.showToast).toHaveBeenCalledWith("Save copied to slot 'speedrun'");
    });
  });

  it("renders offline banner and disables write buttons when RomM is offline", async () => {
    vi.mocked(connectionState.useRommConnectionState).mockReturnValue("offline");

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(screen.getByText(/RomM is offline — slot switching is disabled/)).toBeInTheDocument();
      expect(screen.getByText("Sync now")).toBeDisabled();
      expect(screen.getByText("+ New Slot")).toBeDisabled();
    });
  });

  it("renders stranded-version warning when inactive sibling version drifted", async () => {
    vi.mocked(backend.getVersionList).mockResolvedValue({
      multi_version: true,
      bound_vanished: false,
      versions: [
        {
          rom_id: 99,
          name: "EU Version",
          label: "EU Release",
          installed: true,
          active: false,
          vanished: false,
        } as unknown as backend.VersionInfo,
      ],
    });
    vi.mocked(backend.checkLocalDrift).mockResolvedValue({
      drifted: true,
      rom_id: 99,
    });

    render(<SaveManagementCard appId={100} romId={42} detail={baseDetail} />);

    await waitFor(() => {
      expect(
        screen.getByText('Version "EU Release" has saves that were never uploaded — switch back to sync them.'),
      ).toBeInTheDocument();
    });
  });

  it("renders legacy warning banner when activeSlot is null", async () => {
    render(<SaveManagementCard appId={100} romId={42} detail={{ ...baseDetail, activeSlot: null }} />);

    await waitFor(() => {
      expect(
        screen.getByText("This game uses legacy mode (no slot). Only one save version per game is supported."),
      ).toBeInTheDocument();
    });
  });
});
