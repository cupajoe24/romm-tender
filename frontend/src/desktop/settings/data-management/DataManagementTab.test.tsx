import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act, screen, within } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import * as backend from "../../../api/backend";
import {
  getAllNonSteamShortcutAppIds,
  getLiveRomMShortcutAppIds,
  scanShortcutOwnership,
} from "../../../utils/steamShortcuts";
import { setSyncProgress } from "../../../utils/syncProgress";
import { resetPruneState } from "../../../utils/pruneStore";
import { stubCollectionStore, stubAppStore } from "../../../test-utils/steamStubs";
import type { DataInventory, SyncStats } from "../../../types";
import { DataManagementTab, LEASE_OWNER } from "./DataManagementTab";

vi.mock("../../../utils/steamShortcuts", () => ({
  removeShortcut: vi.fn(),
  setLaunchOptionsConfirmed: vi.fn(),
  getAllNonSteamShortcutAppIds: vi.fn(),
  getLiveRomMShortcutAppIds: vi.fn(),
  scanShortcutOwnership: vi.fn(),
}));

vi.mock("../../../utils/collections", () => ({
  clearAllRomMCollections: vi.fn(),
  clearPlatformCollection: vi.fn(),
}));

const flushAsync = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });

function stats(overrides: Partial<SyncStats> = {}): SyncStats {
  return {
    last_sync: null,
    platforms: 1,
    collections: 0,
    roms: 0,
    total_shortcuts: 0,
    ...overrides,
  } as SyncStats;
}

function inventory(overrides: Partial<DataInventory> = {}): DataInventory {
  return {
    installed_roms: 5,
    installed_bytes: 5242880,
    recovery_bundles: 2,
    recovery_bytes: 1048576,
    recovery_root: "/home/deck/romm-tender-recovery",
    recovery_bundle_list: [
      { name: "Game A", bytes: 500000, day: "2026-10-01" },
      { name: "Game B", bytes: 548576, day: "2026-10-02" },
    ],
    ...overrides,
  };
}

async function renderTab(): Promise<RenderResult> {
  const result = render(<DataManagementTab />);
  await flushAsync();
  return result;
}

describe("DataManagementTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    stubCollectionStore([100, 200]);
    stubAppStore({
      100: { display_name: "RomM Game" },
      200: { display_name: "Firefox" },
    });
    resetPruneState();
    setSyncProgress({ running: false });

    vi.mocked(backend.getDataInventory).mockResolvedValue(inventory());
    vi.mocked(backend.getSyncStats).mockResolvedValue(stats({ total_shortcuts: 12 }));
    vi.mocked(backend.getWhitelistSettings).mockResolvedValue({
      disabled_defaults: [],
      custom_names: [],
    });
    vi.mocked(backend.updateWhitelistSettings).mockResolvedValue({ success: true });
    vi.mocked(backend.removeAllShortcuts).mockResolvedValue({ success: true, app_ids: [100] });
    vi.mocked(backend.uninstallAllRoms).mockResolvedValue({ success: true, removed_count: 5 });
    vi.mocked(backend.cleanupOrphanedGridImages).mockResolvedValue({
      success: true,
      candidate_count: 0,
      removed_count: 0,
    });
    vi.mocked(backend.reportRemovalResults).mockResolvedValue({ success: true, message: "OK" });
    vi.mocked(backend.getPrunePreview).mockResolvedValue({
      success: true,
      total: 0,
      preview_id: "prev-1",
      scope: "bulk",
      items: [],
      offset: 0,
      limit: 50,
      free_bytes: 1073741824,
    });
    vi.mocked(scanShortcutOwnership).mockResolvedValue({ owned: [100], unresolved: [] });
    vi.mocked(getAllNonSteamShortcutAppIds).mockReturnValue([100, 200]);
    vi.mocked(getLiveRomMShortcutAppIds).mockResolvedValue([100]);
  });

  it("exports the distinct lease owner", () => {
    expect(LEASE_OWNER).toBe("tender-settings-data-management");
  });

  it("renders the list of all six data populations as setting cards with Manage buttons", async () => {
    const view = await renderTab();

    expect(view.getByTestId("data-management-list")).toBeInTheDocument();
    for (const id of ["shortcuts", "rom-files", "grid-images", "non-steam", "removed-games", "recovery-bundles"]) {
      const row = view.getByTestId(`data-row-${id}`);
      expect(row).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Manage" })).toBeInTheDocument();
    }

    const shortcutsRow = view.getByTestId("data-row-shortcuts");
    expect(within(shortcutsRow).getByText("Tender's shortcuts")).toBeInTheDocument();
    expect(within(shortcutsRow).getByText("The Steam entries Tender created for your RomM games.")).toBeInTheDocument();
    expect(within(shortcutsRow).getByText("12 shortcuts in Steam")).toBeInTheDocument();
  });

  it("navigates into Shortcuts detail via DrillDown and back", async () => {
    const view = await renderTab();

    // Click shortcuts row
    const shortcutsBtn = within(view.getByTestId("data-row-shortcuts")).getByRole("button");
    await act(async () => {
      fireEvent.click(shortcutsBtn);
    });

    expect(view.getByTestId("shortcuts-detail-pane")).toBeInTheDocument();
    expect(within(view.getByTestId("shortcuts-detail-pane")).getByText("12 shortcuts in Steam")).toBeInTheDocument();

    // Click Back
    const backBtn = view.getByRole("button", { name: /Back/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });

    // Returned to list
    expect(view.getByTestId("data-management-list")).toBeInTheDocument();
  });

  it("confirms shortcuts removal with DesktopConfirmDialog", async () => {
    const view = await renderTab();

    const shortcutsBtn = within(view.getByTestId("data-row-shortcuts")).getByRole("button");
    await act(async () => {
      fireEvent.click(shortcutsBtn);
    });

    const removeBtn = view.getByRole("button", { name: "Remove all shortcuts" });
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    // Dialog appears
    expect(screen.getByRole("dialog", { name: "Remove Shortcuts" })).toBeInTheDocument();

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: "Remove All Shortcuts" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flushAsync();

    expect(backend.removeAllShortcuts).toHaveBeenCalled();
  });

  it("confirms ROM files uninstallation with DesktopConfirmDialog", async () => {
    const view = await renderTab();

    const romFilesBtn = within(view.getByTestId("data-row-rom-files")).getByRole("button");
    await act(async () => {
      fireEvent.click(romFilesBtn);
    });

    expect(view.getByTestId("rom-files-detail-pane")).toBeInTheDocument();

    const uninstallBtn = view.getByRole("button", { name: "Uninstall all ROM files" });
    await act(async () => {
      fireEvent.click(uninstallBtn);
    });

    expect(screen.getByRole("dialog", { name: "Uninstall ROM Files" })).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Uninstall All ROMs" });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await flushAsync();

    expect(backend.uninstallAllRoms).toHaveBeenCalled();
  });

  it("scans and displays grid images pane", async () => {
    const view = await renderTab();

    const gridBtn = within(view.getByTestId("data-row-grid-images")).getByRole("button");
    await act(async () => {
      fireEvent.click(gridBtn);
    });

    expect(view.getByTestId("grid-images-detail-pane")).toBeInTheDocument();
    const scanBtn = view.getByRole("button", { name: "Scan for orphaned images" });

    vi.mocked(backend.cleanupOrphanedGridImages).mockResolvedValueOnce({
      success: true,
      candidate_count: 4,
      removed_count: 0,
    });

    await act(async () => {
      fireEvent.click(scanBtn);
    });
    await flushAsync();

    expect(backend.cleanupOrphanedGridImages).toHaveBeenCalledWith([100, 200], true);
    expect(view.getByRole("button", { name: "Remove 4 orphaned images" })).toBeInTheDocument();
  });

  it("allows configuring whitelist in NonSteam detail pane", async () => {
    const view = await renderTab();

    const nonSteamBtn = within(view.getByTestId("data-row-non-steam")).getByRole("button");
    await act(async () => {
      fireEvent.click(nonSteamBtn);
    });

    expect(view.getByTestId("non-steam-detail-pane")).toBeInTheDocument();

    // Expand whitelist
    const configBtn = view.getByRole("button", { name: /Configure whitelist/i });
    await act(async () => {
      fireEvent.click(configBtn);
    });

    expect(view.getByTestId("whitelist-config-section")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Hide whitelist" })).toBeInTheDocument();
  });

  it("shows recovery bundles table in RecoveryBundles detail pane", async () => {
    const view = await renderTab();

    const recoveryBtn = within(view.getByTestId("data-row-recovery-bundles")).getByRole("button");
    await act(async () => {
      fireEvent.click(recoveryBtn);
    });

    expect(view.getByTestId("recovery-bundles-detail-pane")).toBeInTheDocument();
    expect(view.getByTestId("bundle-table")).toBeInTheDocument();
    expect(view.getByText("Game A")).toBeInTheDocument();
    expect(view.getByText("Game B")).toBeInTheDocument();
  });

  it("renders inline review in RemovedGames detail pane on scan result", async () => {
    vi.mocked(backend.getPrunePreview).mockResolvedValueOnce({
      success: true,
      total: 1,
      candidate_total: 1,
      preview_id: "prev-123",
      scope: "bulk",
      offset: 0,
      limit: 50,
      free_bytes: 1073741824,
      recovery_root: "/recovery",
      items: [
        {
          rom_id: 10,
          name: "Vanished Game",
          fs_name: "Vanished.gba",
          platform_slug: "gba",
          group_id: "g1",
          group_size: 1,
          bound_count: 0,
          candidate: true,
          installed: true,
          installed_bytes: 1024,
          warning: null,
        },
      ],
    });

    const view = await renderTab();

    const removedGamesBtn = within(view.getByTestId("data-row-removed-games")).getByRole("button");
    await act(async () => {
      fireEvent.click(removedGamesBtn);
    });

    expect(view.getByTestId("removed-games-detail-pane")).toBeInTheDocument();

    const scanBtn = view.getByRole("button", { name: "Clean Up Removed RomM Games" });
    await act(async () => {
      fireEvent.click(scanBtn);
    });
    await flushAsync();

    // Inline review pane opens
    expect(view.getByTestId("removed-games-review")).toBeInTheDocument();
    expect(view.getByTestId("cleanup-table")).toBeInTheDocument();
    expect(view.getByText("Vanished Game")).toBeInTheDocument();
  });
});
