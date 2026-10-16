import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as backend from "../../../api/backend";
import type { Settings } from "../../../types";
import {
  ADVANCED_HEADING,
  LOG_LEVEL_DESCRIPTION,
  LOG_LEVEL_LABEL,
  LOG_LEVEL_OPTIONS,
} from "../../../utils/settingsWording";
import { AdvancedTab } from "./AdvancedTab";

const defaultSettings = (over: Partial<Settings> = {}): Settings => ({
  romm_url: "https://romm.local",
  has_token: true,
  steam_input_mode: "default",
  sgdb_api_key_masked: "",
  log_level: "warn",
  romm_allow_insecure_ssl: false,
  ...over,
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });

async function renderTab(over: Partial<Settings> = {}) {
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings(over));
  const result = render(<AdvancedTab />);
  await flush();
  return result;
}

const dropdown = () => screen.getByTestId("dropdown") as HTMLSelectElement;
const rowDescription = (label: string) =>
  screen
    .getAllByTestId("field")
    .find((row) => within(row).queryByTestId("field-label")?.textContent === label)
    ?.querySelector("[data-testid=field-desc]")?.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(backend.getKnownRegions).mockResolvedValue([]);
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings());
  vi.mocked(backend.saveLogLevel).mockResolvedValue({ success: true });
  vi.mocked(backend.getSaveSyncSettings).mockResolvedValue({
    save_sync_enabled: false,
    sync_before_launch: true,
    sync_after_exit: true,
    default_slot: "default",
    autocleanup_limit: 10,
  });
});

describe("AdvancedTab", () => {
  describe("initial rendering", () => {
    it("renders the advanced section with heading and field description", async () => {
      await renderTab();

      expect(screen.getByTestId("tender-settings-advanced")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: ADVANCED_HEADING })).toBeInTheDocument();
      expect(rowDescription(LOG_LEVEL_LABEL)).toBe(LOG_LEVEL_DESCRIPTION);
    });

    it("displays the four canonical log level options in the dropdown", async () => {
      await renderTab();

      const select = dropdown();
      const options = Array.from(select.options).map((o) => ({ data: o.value, label: o.text }));
      expect(options).toEqual([...LOG_LEVEL_OPTIONS]);
    });

    it("sets the dropdown selection from initial settings", async () => {
      await renderTab({ log_level: "debug" });
      expect(dropdown().value).toBe("debug");
    });
  });

  describe("changing log level", () => {
    it("persists log level via saveLogLevel when changed", async () => {
      await renderTab({ log_level: "warn" });

      await act(async () => {
        fireEvent.change(dropdown(), { target: { value: "info" } });
        await Promise.resolve();
      });

      expect(vi.mocked(backend.saveLogLevel)).toHaveBeenCalledWith("info");
      expect(dropdown().value).toBe("info");
    });

    it("reverts the dropdown value if saveLogLevel returns success: false", async () => {
      vi.mocked(backend.saveLogLevel).mockResolvedValueOnce({ success: false });
      await renderTab({ log_level: "warn" });

      await act(async () => {
        fireEvent.change(dropdown(), { target: { value: "debug" } });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(dropdown().value).toBe("warn");
    });

    it("reverts the dropdown value if saveLogLevel rejects", async () => {
      vi.mocked(backend.saveLogLevel).mockRejectedValueOnce(new Error("Refused"));
      await renderTab({ log_level: "warn" });

      await act(async () => {
        fireEvent.change(dropdown(), { target: { value: "error" } });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(dropdown().value).toBe("warn");
    });
  });
});
