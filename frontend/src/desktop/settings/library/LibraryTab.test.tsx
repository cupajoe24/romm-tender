// What this file pins is the desktop drawing of the Library page: which half
// shows, what each row and pane draws from the shared state, that every press
// reaches the hook action the QAM page's does, and that every confirm is asked
// first. The hooks' own behaviour — what a refusal reverts, what a run locks —
// and the decisions behind each mark and line are pinned once, through the QAM
// page (`bigpicture/library/PlatformsTab.test.tsx`, `CollectionsTab.test.tsx`)
// and beside their modules in `utils/`.

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { showContextMenu } from "@decky/ui";
import * as backend from "../../../api/backend";
import type { CollectionSyncSetting, FirmwarePlatformExt, PlatformSyncSetting, Settings } from "../../../types";
import { clearPlatformCollection } from "../../../utils/collections";
import { LibraryTab } from "./LibraryTab";

vi.mock("../../../utils/steamShortcuts", () => ({
  removeShortcut: vi.fn(),
  setLaunchOptionsConfirmed: vi.fn(),
  getAllNonSteamShortcutAppIds: vi.fn(),
  getLiveRomMShortcutAppIds: vi.fn(),
}));
vi.mock("../../../utils/collections", () => ({
  clearPlatformCollection: vi.fn(),
  clearAllRomMCollections: vi.fn(),
}));

const MGBA = {
  label: "mGBA",
  kind: "libretro" as const,
  core_so: "mgba_libretro",
  emulator: "mgba_libretro.so",
  is_default: true,
  bakeable: true,
  reason: null,
};
const VBA = { ...MGBA, label: "VBA Next", core_so: "vba_next_libretro", emulator: "vba", is_default: false };

const platform = (over: Partial<PlatformSyncSetting> = {}): PlatformSyncSetting => ({
  id: 1,
  name: "Game Boy Advance",
  slug: "gba",
  rom_count: 12,
  sync_enabled: true,
  ...over,
});

const firmware = (over: Partial<FirmwarePlatformExt> = {}): FirmwarePlatformExt => ({
  platform_slug: "gba",
  files: [
    {
      id: 1,
      file_name: "gba_bios.bin",
      size: 16384,
      md5: "",
      local_path: "/bios/gba_bios.bin",
      downloaded: false,
      description: "GBA BIOS",
      declaration: "read",
      wanted: "needed",
      required_by_active: true,
      on_server: true,
    } as FirmwarePlatformExt["files"][number],
  ],
  has_games: true,
  bios_level: "missing",
  required_count: 1,
  required_downloaded: 0,
  required_withheld: 0,
  server_count: 1,
  local_count: 0,
  deletable_count: 0,
  emulator_data_reason: null,
  emulator_source: null,
  platform_system: null,
  ...over,
});

const coll = (over: Partial<CollectionSyncSetting> = {}): CollectionSyncSetting => ({
  id: "1",
  name: "Couch co-op",
  rom_count: 10,
  sync_enabled: false,
  kind: "standard",
  is_favorite: false,
  is_own: true,
  ...over,
});

const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });

async function press(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
  await settle();
}

const button = (name: string | RegExp, within_: HTMLElement = document.body) =>
  within(within_).getByRole("button", { name });

async function renderTab() {
  const view = render(<LibraryTab />);
  await settle();
  return view;
}

/** Open a platform's detail from its name in the list, focused first as a real click leaves it. */
async function openPlatform(name: string) {
  const row = button(new RegExp(name), screen.getByTestId("platform-list"));
  row.focus();
  await press(row);
}

/** Open a Collections row's pane from its name. */
async function openKind(id: string) {
  await press(within(screen.getByTestId(`kind-row-${id}`)).getAllByRole("button")[0] as HTMLElement);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(backend.getPlatforms).mockResolvedValue({
    success: true,
    platforms: [platform(), platform({ id: 2, name: "Atari 2600", slug: "atari2600", sync_enabled: false })],
  });
  vi.mocked(backend.getFirmwareStatus).mockResolvedValue({
    success: true,
    server_offline: false,
    platforms: [{ platform_slug: "gba", has_games: true }],
  });
  vi.mocked(backend.getPlatformFirmwareStatus).mockImplementation(async (slug: string) => ({
    success: true,
    platform: slug === "gba" ? firmware() : null,
  }));
  vi.mocked(backend.getRegistryPlatforms).mockResolvedValue({
    platforms: [{ slug: "gba", name: "GBA", count: 9, reachable_count: 9 }],
  });
  vi.mocked(backend.getSystemCoreInfo).mockResolvedValue({
    emulators: [MGBA, VBA],
    emulator_data_available: true,
    emulator_data_reason: null,
    emulator_source: null,
    platform_system: null,
    active_core_label: "mGBA",
  });
  vi.mocked(backend.countPlatformSaves).mockResolvedValue({ count: 3 });
  vi.mocked(backend.savePlatformSync).mockResolvedValue({ success: true, message: "" });
  vi.mocked(backend.setAllPlatformsSync).mockResolvedValue({ success: true, message: "" });
  vi.mocked(backend.getCollections).mockResolvedValue({ success: true, collections: [] });
  vi.mocked(backend.getSettings).mockResolvedValue({ collection_owner_scope: "all" } as Settings);
  vi.mocked(backend.saveCollectionSync).mockResolvedValue({ success: true });
  vi.mocked(backend.saveCollectionsSync).mockResolvedValue({ success: true });
  vi.mocked(backend.debugLog).mockResolvedValue(undefined);
  vi.mocked(clearPlatformCollection).mockResolvedValue(undefined);
});

describe("Platforms", () => {
  it("lists the platforms in their two groups, with no platform open", async () => {
    await renderTab();
    const list = screen.getByTestId("platform-list");
    expect(list).toHaveTextContent("Synced (1)");
    expect(list).toHaveTextContent("Available (1)");
    expect(screen.getByTestId("drill-down-detail")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("platform-detail-gba")).toBeNull();
  });

  it("opens a platform in the list's place, and Back returns to the list and the row", async () => {
    await renderTab();
    await openPlatform("Game Boy Advance");
    const detail = screen.getByTestId("platform-detail-gba");
    expect(detail).toHaveTextContent("12 on RomM · 9 in Steam · mGBA");
    expect(screen.getByTestId("drill-down-list")).toHaveAttribute("aria-hidden", "true");
    expect(button("Back")).toHaveFocus();

    await press(button("Back"));
    expect(screen.getByTestId("drill-down-list")).toHaveAttribute("aria-hidden", "false");
    expect(button(/Game Boy Advance/, screen.getByTestId("platform-list"))).toHaveFocus();
  });

  it("switches a platform from its toggle without opening it", async () => {
    await renderTab();
    const row = screen.getByTestId("platform-row-atari2600");
    await act(async () => {
      fireEvent.click(within(row).getByTestId("toggle-input"));
      await Promise.resolve();
    });
    await settle();
    expect(backend.savePlatformSync).toHaveBeenCalledWith(2, true);
    expect(screen.getByTestId("drill-down-list")).toHaveAttribute("aria-hidden", "false");
  });

  it("switches every platform from Enable all / Disable all", async () => {
    await renderTab();
    await press(button("Disable all"));
    expect(backend.setAllPlatformsSync).toHaveBeenCalledWith(false);
  });

  it("draws the BIOS table from the shared view, and fetches the required files", async () => {
    vi.mocked(backend.downloadRequiredFirmware).mockResolvedValue({ success: true, message: "", downloaded: 1 });
    await renderTab();
    await openPlatform("Game Boy Advance");
    const table = screen.getByTestId("bios-table");
    expect(within(table).getByTestId("disk-mark")).toHaveTextContent("✗");
    expect(screen.getByTestId("bios-legend")).toHaveTextContent("required, missing");

    await press(button("Download required (1)"));
    expect(backend.downloadRequiredFirmware).toHaveBeenCalledWith("gba");
  });

  it("opens the emulator menu from the core button", async () => {
    await renderTab();
    await openPlatform("Game Boy Advance");
    await press(button("Emulator Core"));
    expect(showContextMenu).toHaveBeenCalled();
  });

  it("asks before removing the shortcuts, and removes nothing on Cancel", async () => {
    await renderTab();
    await openPlatform("Game Boy Advance");
    await press(button("Remove 9 shortcuts"));
    const dialog = screen.getByRole("dialog", { name: "Remove 9 Game Boy Advance shortcuts?" });
    await press(button("Cancel", dialog));
    expect(backend.removePlatformShortcuts).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before deleting the save files, and deletes them on yes", async () => {
    vi.mocked(backend.deletePlatformSaves).mockResolvedValue({ success: true, message: "", deleted_count: 3 });
    await renderTab();
    await openPlatform("Game Boy Advance");
    await press(button("Delete 3 save files"));
    const dialog = screen.getByRole("dialog", { name: "Delete all save files for Game Boy Advance?" });
    await press(button("Delete Save Files", dialog));
    expect(backend.deletePlatformSaves).toHaveBeenCalledWith("gba");
  });

  it("says why it has nothing to list", async () => {
    vi.mocked(backend.getPlatforms).mockResolvedValue({ success: false, platforms: [] });
    await renderTab();
    expect(screen.getByTestId("tender-settings-library")).toHaveTextContent("Could not read your platforms.");
  });

  it("fetches one file from its row", async () => {
    vi.mocked(backend.downloadPlatformFirmwareFile).mockResolvedValue({ success: true, message: "", downloaded: 1 });
    await renderTab();
    await openPlatform("Game Boy Advance");
    await press(button("Download", screen.getByTestId("bios-table")));
    expect(backend.downloadPlatformFirmwareFile).toHaveBeenCalledWith("gba", "gba_bios.bin");
  });

  it("asks before deleting a downloaded file, and before deleting every one", async () => {
    vi.mocked(backend.deleteBiosFile).mockResolvedValue({ success: true, deleted_count: 1, message: "" });
    vi.mocked(backend.deletePlatformBios).mockResolvedValue({ success: true, deleted_count: 1, message: "" });
    const held = firmware();
    held.files = held.files.map((file) => ({ ...file, downloaded: true, satisfied: true, deletable_count: 1 }));
    held.deletable_count = 1;
    vi.mocked(backend.getPlatformFirmwareStatus).mockResolvedValue({ success: true, platform: held });
    await renderTab();
    await openPlatform("Game Boy Advance");

    await press(button("Delete", screen.getByTestId("bios-table")));
    await press(button("Delete", screen.getByRole("dialog", { name: "Delete gba_bios.bin?" })));
    expect(backend.deleteBiosFile).toHaveBeenCalledWith("gba", "gba_bios.bin");

    await press(button("Delete BIOS (1)"));
    await press(
      button("Delete BIOS Files", screen.getByRole("dialog", { name: "Delete BIOS files for Game Boy Advance?" })),
    );
    expect(backend.deletePlatformBios).toHaveBeenCalledWith("gba");
  });

  it("says why there is no emulator to pick, and keeps the button disabled", async () => {
    vi.mocked(backend.getSystemCoreInfo).mockResolvedValue({
      emulators: [],
      emulator_data_available: false,
      emulator_data_reason: "no_source",
      emulator_source: null,
      platform_system: null,
      active_core_label: null,
    });
    await renderTab();
    await openPlatform("Game Boy Advance");
    expect(button("Emulator Core")).toBeDisabled();
    expect(screen.getByTestId("platform-detail-gba")).toHaveTextContent("No emulator source was found");
  });

  it("says why a platform has no BIOS rows", async () => {
    await renderTab();
    await openPlatform("Atari 2600");
    expect(screen.getByTestId("platform-detail-atari2600")).toHaveTextContent(
      "Nothing is known about this platform's BIOS files.",
    );
  });
});

describe("Collections", () => {
  const LIBRARY = [
    coll({ id: "fav", name: "Favourites", is_favorite: true, rom_count: 14, sync_enabled: true }),
    coll({ id: "10", name: "Kids", sync_enabled: true }),
    coll({ id: "11", name: "Finished" }),
  ];

  async function openCollections(collections = LIBRARY) {
    vi.mocked(backend.getCollections).mockResolvedValue({ success: true, collections });
    await renderTab();
    await press(button("Collections"));
  }

  it("reads the collections only once the half is entered", async () => {
    await renderTab();
    expect(backend.getCollections).not.toHaveBeenCalled();
    await press(button("Collections"));
    expect(backend.getCollections).toHaveBeenCalled();
    expect(screen.getByTestId("kind-list")).toBeInTheDocument();
  });

  it("counts each kind, and opens a kind's collections in the list's place", async () => {
    await openCollections();
    expect(within(screen.getByTestId("kind-row-standard")).getByTestId("row-count")).toHaveTextContent("1 of 2");
    expect(screen.getByTestId("drill-down-detail")).toHaveAttribute("aria-hidden", "true");
    await openKind("standard");
    expect(screen.getAllByTestId("collection-row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Kids"),
      expect.stringContaining("Finished"),
    ]);
  });

  it("switches one collection from its row", async () => {
    await openCollections();
    await openKind("standard");
    const finished = screen.getAllByTestId("collection-row")[1] as HTMLElement;
    await act(async () => {
      fireEvent.click(within(finished).getByTestId("toggle-input"));
      await Promise.resolve();
    });
    await settle();
    expect(backend.saveCollectionSync).toHaveBeenCalledWith("11", "standard", true);
  });

  it("asks before switching more than twenty at once", async () => {
    const many = Array.from({ length: 25 }, (_, i) => coll({ id: `c${i}`, name: `Collection ${i}` }));
    await openCollections(many);
    await openKind("standard");
    await press(button("Enable all"));
    const dialog = screen.getByRole("dialog", { name: "Enable all 25 in Collections?" });
    expect(backend.saveCollectionsSync).not.toHaveBeenCalled();
    await press(button("Enable all", dialog));
    expect(backend.saveCollectionsSync).toHaveBeenCalled();
  });

  it("switches favorites from its row, and opens the Favorites pane from its name", async () => {
    await openCollections();
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("kind-row-favorites")).getByTestId("toggle-input"));
      await Promise.resolve();
    });
    await settle();
    expect(backend.saveCollectionSync).toHaveBeenCalledWith("fav", "standard", false);
    await openKind("favorites");
    expect(screen.getByTestId("drill-down-detail")).toHaveTextContent("14 ROMs in it");
  });

  it("says why the collections are not there, and asks again on the next entry", async () => {
    vi.mocked(backend.getCollections).mockResolvedValue({
      success: false,
      collections: [],
      message: "Cannot reach the RomM server",
    });
    await renderTab();
    await press(button("Collections"));
    await openKind("standard");
    expect(screen.getByTestId("collections-load-failed")).toHaveTextContent("Cannot reach the RomM server");

    await press(button("Platforms"));
    await press(button("Collections"));
    expect(backend.getCollections).toHaveBeenCalledTimes(2);
  });

  it("narrows the table to the search", async () => {
    await openCollections();
    await openKind("standard");
    fireEvent.change(within(screen.getByTestId("collections-search")).getByTestId("text-field"), {
      target: { value: "fin" },
    });
    await settle();
    expect(screen.getAllByTestId("collection-row")).toHaveLength(1);
  });

  it("shows the owner switch's pane from its row", async () => {
    await openCollections();
    await openKind("owner");
    expect(screen.getByTestId("tender-settings-library")).toHaveTextContent(
      "their public ones, on a shared RomM server",
    );
  });
});
