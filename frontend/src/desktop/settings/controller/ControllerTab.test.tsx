import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as backend from "../../../api/backend";
import type { Settings } from "../../../types";
import {
  APPLY_TO_ALL_SHORTCUTS_LABEL,
  APPLYING_TO_ALL_SHORTCUTS_LABEL,
  CONTROLLER_HEADING,
  STEAM_INPUT_MODE_DESCRIPTION,
  STEAM_INPUT_MODE_LABEL,
} from "../../../utils/settingsWording";
import { ControllerTab } from "./ControllerTab";

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
  const result = render(<ControllerTab />);
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

const dropdown = () => screen.getByTestId("dropdown") as HTMLSelectElement;
const applyButton = () =>
  screen.getByRole("button", {
    name: new RegExp(`^(${APPLY_TO_ALL_SHORTCUTS_LABEL}|${APPLYING_TO_ALL_SHORTCUTS_LABEL})$`),
  });
const rowDescription = (label: string) =>
  screen
    .getAllByTestId("field")
    .find((row) => within(row).queryByTestId("field-label")?.textContent === label)
    ?.querySelector("[data-testid=field-desc]")?.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(backend.getKnownRegions).mockResolvedValue([]);
  vi.mocked(backend.getSettings).mockResolvedValue(defaultSettings());
  vi.mocked(backend.saveSteamInputSetting).mockResolvedValue({ success: true });
  vi.mocked(backend.applySteamInputSetting).mockResolvedValue({
    success: true,
    message: "Steam Input applied",
  });
  vi.mocked(backend.getSaveSyncSettings).mockResolvedValue({
    save_sync_enabled: false,
    sync_before_launch: true,
    sync_after_exit: true,
    default_slot: "default",
    autocleanup_limit: 10,
  });
});

describe("ControllerTab", () => {
  describe("initial rendering", () => {
    it("renders the controller section with title and description", async () => {
      await renderTab();

      expect(screen.getByTestId("tender-settings-controller")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: CONTROLLER_HEADING })).toBeInTheDocument();
      expect(rowDescription(STEAM_INPUT_MODE_LABEL)).toBe(STEAM_INPUT_MODE_DESCRIPTION);
    });

    it("displays the three Steam Input mode options in the dropdown", async () => {
      await renderTab();

      const select = dropdown();
      const options = Array.from(select.options).map((o) => ({ data: o.value, label: o.text }));
      expect(options).toEqual([
        { data: "default", label: "Default (Recommended)" },
        { data: "force_on", label: "Force On" },
        { data: "force_off", label: "Force Off" },
      ]);
    });

    it("sets the dropdown selection from initial settings", async () => {
      await renderTab({ steam_input_mode: "force_on" });
      expect(dropdown().value).toBe("force_on");
    });

    it("renders the Apply to All Shortcuts button in enabled state", async () => {
      await renderTab();

      const btn = applyButton();
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
      expect(btn.textContent).toBe(APPLY_TO_ALL_SHORTCUTS_LABEL);
    });

    it("renders no status element when steamInputStatus is empty", async () => {
      await renderTab();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("Steam Input Mode change", () => {
    it("calls saveSteamInputSetting and updates dropdown value on change", async () => {
      await renderTab({ steam_input_mode: "default" });

      const select = dropdown();
      await act(async () => {
        fireEvent.change(select, { target: { value: "force_off" } });
        await Promise.resolve();
      });
      await flush();

      expect(backend.saveSteamInputSetting).toHaveBeenCalledWith("force_off");
      expect(select.value).toBe("force_off");
    });

    it("clears existing status when mode is changed", async () => {
      await renderTab();

      // First apply to produce a status
      await press(applyButton());
      expect(screen.getByRole("status").textContent).toBe("Steam Input applied");

      // Now change mode -> status is cleared
      const select = dropdown();
      await act(async () => {
        fireEvent.change(select, { target: { value: "force_on" } });
        await Promise.resolve();
      });
      await flush();

      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("Apply to All Shortcuts", () => {
    it("calls applySteamInputSetting and displays result message on success", async () => {
      vi.mocked(backend.applySteamInputSetting).mockResolvedValue({
        success: true,
        message: "Steam Input set to 'default' for 14 shortcuts",
      });
      await renderTab();

      await press(applyButton());

      expect(backend.applySteamInputSetting).toHaveBeenCalledTimes(1);
      const status = screen.getByRole("status");
      expect(status).toBeInTheDocument();
      expect(status.textContent).toBe("Steam Input set to 'default' for 14 shortcuts");
    });

    it("shows applying state while in flight and refuses concurrent presses", async () => {
      let resolveApply: ((res: { success: boolean; message: string }) => void) | undefined;
      vi.mocked(backend.applySteamInputSetting).mockReturnValue(
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
      );

      await renderTab();

      // Start apply
      await act(async () => {
        fireEvent.click(applyButton());
        await Promise.resolve();
      });

      // Verify in-flight state
      const btn = applyButton();
      expect(btn).toBeDisabled();
      expect(btn.textContent).toBe(APPLYING_TO_ALL_SHORTCUTS_LABEL);

      // Attempt second press while in flight
      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });
      expect(backend.applySteamInputSetting).toHaveBeenCalledTimes(1);

      // Complete the in-flight request
      await act(async () => {
        resolveApply?.({ success: true, message: "Applied successfully" });
        await Promise.resolve();
      });
      await flush();

      // Verify re-armed state
      expect(btn).not.toBeDisabled();
      expect(btn.textContent).toBe(APPLY_TO_ALL_SHORTCUTS_LABEL);
      expect(screen.getByRole("status").textContent).toBe("Applied successfully");
    });

    it("displays 'Failed to apply' and re-arms button when apply rejects", async () => {
      vi.mocked(backend.applySteamInputSetting).mockRejectedValue(new Error("VDF write failed"));
      await renderTab();

      await press(applyButton());

      const btn = applyButton();
      expect(btn).not.toBeDisabled();
      expect(btn.textContent).toBe(APPLY_TO_ALL_SHORTCUTS_LABEL);
      expect(screen.getByRole("status").textContent).toBe("Failed to apply");
    });
  });
});
