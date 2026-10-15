import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as backend from "../../../api/backend";
import type { RegisteredDevice, SaveSyncSettings, Settings } from "../../../types";
import { SaveSyncTab } from "./SaveSyncTab";

const defaultSettings: Settings = {
  romm_url: "https://romm.local",
  has_token: true,
  steam_input_mode: "default",
  sgdb_api_key_masked: "",
  log_level: "warn",
  romm_allow_insecure_ssl: false,
};

const defaultSaveSync: SaveSyncSettings = {
  save_sync_enabled: true,
  sync_before_launch: true,
  sync_after_exit: true,
  default_slot: "default",
  autocleanup_limit: 10,
};

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });

async function renderTab(saveSyncOver: Partial<SaveSyncSettings> = {}) {
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings);
  vi.mocked(backend.getSaveSyncSettings).mockResolvedValue({ ...defaultSaveSync, ...saveSyncOver });
  const result = render(<SaveSyncTab />);
  await flush();
  return result;
}

async function press(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
  await flush();
}

const fieldRows = () => screen.getAllByTestId("field");
const rowByLabel = (label: string) =>
  fieldRows().find((row) => within(row).queryByTestId("field-label")?.textContent === label);
const rowDescription = (label: string) => rowByLabel(label)?.querySelector("[data-testid=field-desc]")?.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(backend.getKnownRegions).mockResolvedValue([]);
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings);
  vi.mocked(backend.getSaveSyncSettings).mockResolvedValue(defaultSaveSync);
  vi.mocked(backend.listDevices).mockResolvedValue({ success: true, devices: [] });
  vi.mocked(backend.updateSaveSyncSettings).mockResolvedValue({ success: true });
  vi.mocked(backend.syncAllSaves).mockResolvedValue({
    success: true,
    message: "Sync complete: 2 uploaded",
    synced: 2,
    conflicts: 0,
  });
  vi.mocked(backend.ensureDeviceRegistered).mockResolvedValue({
    success: true,
    device_id: "dev-1",
    device_name: "Steam Deck",
  });
});

describe("SaveSyncTab - Master switch and disabled state", () => {
  it("shows disabled explanation when save sync is turned off", async () => {
    await renderTab({ save_sync_enabled: false });

    expect(screen.getByTestId("tender-settings-save-sync")).toBeInTheDocument();
    expect(rowDescription("Save sync is disabled")).toBe("Enable above to configure sync settings");
    expect(screen.queryByTestId("devices-table")).toBeNull();
    expect(screen.queryByTestId("dropdown")).toBeNull();
  });

  it("prompts for confirmation when enabling save sync", async () => {
    await renderTab({ save_sync_enabled: false });

    const toggles = screen.getAllByTestId("toggle-input");
    const masterToggle = toggles[0]!;
    expect((masterToggle as HTMLInputElement).checked).toBe(false);

    // Toggle on -> opens confirmation dialog
    await press(masterToggle);
    expect(screen.getByRole("dialog", { name: "Enable Save Sync?" })).toBeInTheDocument();

    // Confirm -> calls updateSaveSyncSettings and registers device
    const confirmBtn = screen.getByRole("button", { name: "I am sure" });
    await press(confirmBtn);

    expect(backend.updateSaveSyncSettings).toHaveBeenCalledWith(expect.objectContaining({ save_sync_enabled: true }));
    expect(backend.ensureDeviceRegistered).toHaveBeenCalled();
  });
});

describe("SaveSyncTab - Configured Save Sync settings", () => {
  it("renders all controls and toggles when save sync is enabled", async () => {
    vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(backend.ensureDeviceRegistered).mockResolvedValue({
      success: true,
      device_id: "dev-1",
      device_name: "My Steam Deck",
    });
    await renderTab();

    expect(rowDescription("Device")).toBe('Registered as "My Steam Deck"');
    expect(rowDescription("Sync before launch")).toBe("Download newer saves from server before starting a game");
    expect(rowDescription("Sync after exit")).toBe("Upload changed saves to server after closing a game");
    expect(rowDescription("Default Save Slot")).toContain("default — applies to new games");
    expect(rowDescription("Save History Limit")).toBe("Max save versions kept per slot on the server");
    expect(screen.getByRole("button", { name: "Sync All Saves Now" })).toBeInTheDocument();
  });

  it("updates sync_before_launch and sync_after_exit on toggle", async () => {
    await renderTab();

    const toggles = screen.getAllByTestId("toggle-input");
    // [0] = master, [1] = sync_before_launch, [2] = sync_after_exit
    expect(toggles.length).toBeGreaterThanOrEqual(3);

    await press(toggles[1]!);
    expect(backend.updateSaveSyncSettings).toHaveBeenCalledWith(expect.objectContaining({ sync_before_launch: false }));

    await press(toggles[2]!);
    expect(backend.updateSaveSyncSettings).toHaveBeenCalledWith(expect.objectContaining({ sync_after_exit: false }));
  });

  it("edits the default save slot via DesktopDialog and submits trimmed name", async () => {
    await renderTab({ default_slot: "default" });

    const editBtn = within(rowByLabel("Default Save Slot")!).getByRole("button", { name: "Edit" });
    await press(editBtn);

    const dialog = screen.getByRole("dialog", { name: "Default Save Slot" });
    expect(dialog).toBeInTheDocument();

    const input = within(dialog).getByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("default");

    fireEvent.change(input, { target: { value: "  slot-speedrun  " } });
    await press(within(dialog).getByRole("button", { name: "Save" }));

    expect(backend.updateSaveSyncSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_slot: "slot-speedrun" }),
    );
  });

  it("shows reset button when default slot is customized, and resets to 'default'", async () => {
    await renderTab({ default_slot: "custom-slot" });

    const resetBtn = within(rowByLabel("Default Save Slot")!).getByRole("button", { name: "Reset to default" });
    expect(resetBtn).toBeInTheDocument();

    await press(resetBtn);
    expect(backend.updateSaveSyncSettings).toHaveBeenCalledWith(expect.objectContaining({ default_slot: "default" }));
  });

  it("changes autocleanup_limit via history limit dropdown", async () => {
    await renderTab({ autocleanup_limit: 10 });

    const dropdown = screen.getByTestId("dropdown");
    expect((dropdown as HTMLSelectElement).value).toBe("10");

    fireEvent.change(dropdown, { target: { value: "20" } });
    await flush();

    expect(backend.updateSaveSyncSettings).toHaveBeenCalledWith(expect.objectContaining({ autocleanup_limit: 20 }));
  });

  it("triggers sync all saves and displays outcome message", async () => {
    await renderTab();

    const syncBtn = screen.getByRole("button", { name: "Sync All Saves Now" });
    await press(syncBtn);

    expect(backend.syncAllSaves).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Sync complete: 2 uploaded");
  });

  it("displays failure status when sync all saves fails", async () => {
    vi.mocked(backend.syncAllSaves).mockRejectedValueOnce(new Error("Network timeout"));
    await renderTab();

    const syncBtn = screen.getByRole("button", { name: "Sync All Saves Now" });
    await press(syncBtn);

    expect(screen.getByRole("status")).toHaveTextContent("Sync failed");
  });
});

describe("SaveSyncTab - Registered Devices section", () => {
  it("displays loading state while devices are loading", async () => {
    let resolveDevices!: (value: backend.ListDevicesResponse) => void;
    vi.mocked(backend.listDevices).mockReturnValue(
      new Promise((res) => {
        resolveDevices = res;
      }),
    );

    render(<SaveSyncTab />);
    // Let getSettings and getSaveSyncSettings resolve so SaveSyncTab renders RegisteredDevicesSection
    await flush();
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await act(async () => {
      resolveDevices({ success: true, devices: [] });
    });
    await flush();
    expect(screen.getByText("No devices registered")).toBeInTheDocument();
  });

  it("displays error message when devices fetch fails", async () => {
    vi.mocked(backend.listDevices).mockResolvedValue({
      success: false,
      message: "Connection refused",
      reason: "server_unreachable",
    });
    await renderTab();

    expect(screen.getByText("Could not load devices")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("displays empty state when no devices are registered", async () => {
    vi.mocked(backend.listDevices).mockResolvedValue({ success: true, devices: [] });
    await renderTab();

    expect(screen.getByText("No devices registered")).toBeInTheDocument();
  });

  it("renders device table with columns, names, badges and last seen timestamps", async () => {
    const devices: RegisteredDevice[] = [
      {
        id: "dev-deck",
        name: "OLED Deck",
        platform: "linux",
        client: "Tender",
        client_version: "1.0.0",
        last_seen: "2026-10-14T12:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        is_current_device: true,
      },
      {
        id: "dev-pc",
        name: "Desktop PC",
        platform: "windows",
        client: "Tender",
        client_version: "1.0.0",
        last_seen: null,
        created_at: "2026-01-02T00:00:00Z",
        is_current_device: false,
      },
    ];
    vi.mocked(backend.listDevices).mockResolvedValue({ success: true, devices });
    await renderTab();

    const table = screen.getByTestId("devices-table");
    expect(table).toBeInTheDocument();

    // Check headers
    expect(within(table).getByText("Device")).toBeInTheDocument();
    expect(within(table).getByText("Client")).toBeInTheDocument();
    expect(within(table).getByText("Last seen")).toBeInTheDocument();

    // Check device rows
    const row0 = screen.getByTestId("device-row-dev-deck");
    expect(within(row0).getByText("OLED Deck")).toBeInTheDocument();
    expect(within(row0).getByText("(this device)")).toBeInTheDocument();
    expect(within(row0).getByText("Tender v1.0.0")).toBeInTheDocument();

    const row1 = screen.getByTestId("device-row-dev-pc");
    expect(within(row1).getByText("Desktop PC")).toBeInTheDocument();
    expect(within(row1).queryByText("(this device)")).toBeNull();
    expect(within(row1).getByText("never")).toBeInTheDocument();
  });
});
