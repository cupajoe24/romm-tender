import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as backend from "../../../api/backend";
import type { Settings } from "../../../types";
import { AUTO_REGION, DEFAULT_REGION_LABEL } from "../../../utils/preferredRegion";
import {
  COLLECTION_NAMING_MODE_DESCRIPTION,
  COLLECTION_NAMING_MODE_LABEL,
  PLATFORM_GROUPS_DESCRIPTION,
  PLATFORM_GROUPS_LABEL,
  PREFERRED_REGION_DESCRIPTION,
  PREFERRED_REGION_LABEL,
  STEAM_LIBRARY_HEADING,
} from "../../../utils/settingsWording";
import { SteamLibraryTab } from "./SteamLibraryTab";

const defaultSettings = (over: Partial<Settings> = {}): Settings => ({
  romm_url: "https://romm.local",
  has_token: true,
  steam_input_mode: "default",
  sgdb_api_key_masked: "",
  log_level: "warn",
  romm_allow_insecure_ssl: false,
  preferred_region: AUTO_REGION,
  collection_create_platform_groups: false,
  collection_naming_mode: "merge",
  ...over,
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });

async function renderTab(over: Partial<Settings> = {}, libraryRegions: string[] = []) {
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings(over));
  vi.mocked(backend.getKnownRegions).mockResolvedValue(libraryRegions);
  const result = render(<SteamLibraryTab />);
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

async function selectOption(select: HTMLSelectElement, value: string) {
  await act(async () => {
    fireEvent.change(select, { target: { value } });
    await Promise.resolve();
  });
  await flush();
}

const dropdown = () => screen.getByTestId("dropdown") as HTMLSelectElement;

function fieldRow(label: string): HTMLElement {
  const row = screen
    .getAllByTestId("field")
    .find((el) => within(el).queryByTestId("field-label")?.textContent === label);
  if (!row) throw new Error(`Field row "${label}" not found`);
  return row;
}

function fieldDescription(label: string): string | null | undefined {
  return fieldRow(label).querySelector("[data-testid=field-desc]")?.textContent;
}

function fieldToggle(label: string): HTMLInputElement {
  return within(fieldRow(label)).getByTestId("toggle-input") as HTMLInputElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(backend.getKnownRegions).mockResolvedValue([]);
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings());
  vi.mocked(backend.savePreferredRegion).mockResolvedValue({ success: true });
  vi.mocked(backend.saveCollectionPlatformGroups).mockResolvedValue({ success: true });
  vi.mocked(backend.setCollectionNamingMode).mockResolvedValue({ success: true });
  vi.mocked(backend.getSaveSyncSettings).mockResolvedValue({
    save_sync_enabled: false,
    sync_before_launch: true,
    sync_after_exit: true,
    default_slot: "default",
    autocleanup_limit: 10,
  });
});

describe("SteamLibraryTab", () => {
  describe("initial rendering", () => {
    it("renders the steam library section with title", async () => {
      await renderTab();

      expect(screen.getByTestId("tender-settings-steam-library")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: STEAM_LIBRARY_HEADING })).toBeInTheDocument();
    });

    it("renders preferred region row with description and anchor options", async () => {
      await renderTab();

      expect(fieldDescription(PREFERRED_REGION_LABEL)).toBe(PREFERRED_REGION_DESCRIPTION);
      const select = dropdown();
      const options = Array.from(select.options).map((o) => ({ data: o.value, label: o.text }));
      expect(options).toEqual([
        { data: AUTO_REGION, label: DEFAULT_REGION_LABEL },
        { data: "World", label: "World" },
        { data: "USA", label: "USA" },
        { data: "Europe", label: "Europe" },
        { data: "Japan", label: "Japan" },
      ]);
      expect(select.value).toBe(AUTO_REGION);
    });

    it("appends distinct non-anchor regions from getKnownRegions to dropdown", async () => {
      await renderTab({}, ["Korea", "Brazil", "USA"]);

      const select = dropdown();
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toEqual([AUTO_REGION, "World", "USA", "Europe", "Japan", "Brazil", "Korea"]);
    });

    it("reflects preferred_region from initial settings", async () => {
      await renderTab({ preferred_region: "Europe" });

      expect(dropdown().value).toBe("Europe");
    });

    it("renders platform groups toggle with label and description", async () => {
      await renderTab({ collection_create_platform_groups: false });

      expect(fieldDescription(PLATFORM_GROUPS_LABEL)).toBe(PLATFORM_GROUPS_DESCRIPTION);
      expect(fieldToggle(PLATFORM_GROUPS_LABEL).checked).toBe(false);
    });

    it("renders platform groups toggle checked when true in initial settings", async () => {
      await renderTab({ collection_create_platform_groups: true });

      expect(fieldToggle(PLATFORM_GROUPS_LABEL).checked).toBe(true);
    });

    it("renders collection naming mode toggle with label and description", async () => {
      await renderTab({ collection_naming_mode: "merge" });

      expect(fieldDescription(COLLECTION_NAMING_MODE_LABEL)).toBe(COLLECTION_NAMING_MODE_DESCRIPTION);
      expect(fieldToggle(COLLECTION_NAMING_MODE_LABEL).checked).toBe(false);
    });

    it("renders collection naming mode toggle checked when by_label in initial settings", async () => {
      await renderTab({ collection_naming_mode: "by_label" });

      expect(fieldToggle(COLLECTION_NAMING_MODE_LABEL).checked).toBe(true);
    });
  });

  describe("preferred region change flow", () => {
    it("does not trigger confirmation or save when selecting the currently selected region", async () => {
      await renderTab({ preferred_region: "USA" });

      await selectOption(dropdown(), "USA");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(backend.savePreferredRegion).not.toHaveBeenCalled();
    });

    it("opens confirmation dialog when selecting a different region", async () => {
      await renderTab({ preferred_region: AUTO_REGION });

      await selectOption(dropdown(), "Japan");

      const dialog = screen.getByRole("dialog", { name: "Change Preferred Region" });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveTextContent(`${DEFAULT_REGION_LABEL} → Japan`);
      expect(dialog).toHaveTextContent("This applies to games synced from now on");
    });

    it("cancels the region change when dismiss/cancel is clicked", async () => {
      await renderTab({ preferred_region: AUTO_REGION });

      await selectOption(dropdown(), "Japan");
      const dialog = screen.getByRole("dialog", { name: "Change Preferred Region" });
      const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });

      await press(cancelButton);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(backend.savePreferredRegion).not.toHaveBeenCalled();
      expect(dropdown().value).toBe(AUTO_REGION);
    });

    // Steam's Dropdown keeps the picked option in state of its own, which an
    // unchanged `selectedOption` never takes back; only a new instance does.
    it("remounts the dropdown when the region change is cancelled", async () => {
      await renderTab({ preferred_region: AUTO_REGION });
      const before = dropdown();

      await selectOption(before, "Japan");
      await press(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

      expect(dropdown()).not.toBe(before);
      expect(before).not.toBeInTheDocument();
    });

    it("keeps the same dropdown when the region change is accepted", async () => {
      await renderTab({ preferred_region: AUTO_REGION });
      const before = dropdown();

      await selectOption(before, "Japan");
      await press(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));

      expect(dropdown()).toBe(before);
    });

    it("persists and updates dropdown when confirmation is accepted", async () => {
      await renderTab({ preferred_region: AUTO_REGION });

      await selectOption(dropdown(), "Japan");
      const dialog = screen.getByRole("dialog", { name: "Change Preferred Region" });
      const saveButton = within(dialog).getByRole("button", { name: "Save" });

      await press(saveButton);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(backend.savePreferredRegion).toHaveBeenCalledTimes(1);
      expect(backend.savePreferredRegion).toHaveBeenCalledWith("Japan");
      expect(dropdown().value).toBe("Japan");
    });
  });

  describe("platform groups toggle flow", () => {
    it("enables platform groups and saves setting", async () => {
      await renderTab({ collection_create_platform_groups: false });

      const toggle = fieldToggle(PLATFORM_GROUPS_LABEL);
      await press(toggle);

      expect(backend.saveCollectionPlatformGroups).toHaveBeenCalledTimes(1);
      expect(backend.saveCollectionPlatformGroups).toHaveBeenCalledWith(true);
      expect(toggle.checked).toBe(true);
    });

    it("disables platform groups and saves setting", async () => {
      await renderTab({ collection_create_platform_groups: true });

      const toggle = fieldToggle(PLATFORM_GROUPS_LABEL);
      await press(toggle);

      expect(backend.saveCollectionPlatformGroups).toHaveBeenCalledTimes(1);
      expect(backend.saveCollectionPlatformGroups).toHaveBeenCalledWith(false);
      expect(toggle.checked).toBe(false);
    });

    it("reverts toggle state when saveCollectionPlatformGroups fails", async () => {
      vi.mocked(backend.saveCollectionPlatformGroups).mockRejectedValueOnce(new Error("Network error"));
      await renderTab({ collection_create_platform_groups: false });

      const toggle = fieldToggle(PLATFORM_GROUPS_LABEL);
      await press(toggle);

      expect(toggle.checked).toBe(false);
    });
  });

  describe("collection naming mode toggle flow", () => {
    it("enables by_label naming mode when toggled on", async () => {
      await renderTab({ collection_naming_mode: "merge" });

      const toggle = fieldToggle(COLLECTION_NAMING_MODE_LABEL);
      await press(toggle);

      expect(backend.setCollectionNamingMode).toHaveBeenCalledTimes(1);
      expect(backend.setCollectionNamingMode).toHaveBeenCalledWith("by_label");
      expect(toggle.checked).toBe(true);
    });

    it("reverts to merge naming mode when toggled off", async () => {
      await renderTab({ collection_naming_mode: "by_label" });

      const toggle = fieldToggle(COLLECTION_NAMING_MODE_LABEL);
      await press(toggle);

      expect(backend.setCollectionNamingMode).toHaveBeenCalledTimes(1);
      expect(backend.setCollectionNamingMode).toHaveBeenCalledWith("merge");
      expect(toggle.checked).toBe(false);
    });

    it("reverts toggle state when setCollectionNamingMode fails", async () => {
      vi.mocked(backend.setCollectionNamingMode).mockRejectedValueOnce(new Error("Network error"));
      await renderTab({ collection_naming_mode: "merge" });

      const toggle = fieldToggle(COLLECTION_NAMING_MODE_LABEL);
      await press(toggle);

      expect(toggle.checked).toBe(false);
    });
  });
});
