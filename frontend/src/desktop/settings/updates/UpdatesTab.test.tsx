import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UpdateInstall } from "../../../utils/useUpdateInstall";
import type { SettingsPageState } from "../../../utils/useSettingsPage";
import type { UpdateNoticeState } from "../../../utils/updateNoticeStore";
import type { UpdateOutcomeState } from "../../../utils/updateOutcomeStore";
import { NOT_INSTALLED_PROGRAM } from "../../../utils/updateAvailableView";
import { SHOW_OUTPUT } from "../../../utils/updateInstallView";
import {
  AVAILABLE_VERSION_LABEL,
  CHECK_NOW_LABEL,
  CHECKING_NOW_LABEL,
  DAILY_CHECK_DESCRIPTION,
  DAILY_CHECK_LABEL,
  INSTALLED_VERSION_LABEL,
  UPDATES_HEADING,
} from "../../../utils/settingsWording";
import { UpdatesTab } from "./UpdatesTab";

const installView = vi.hoisted(() => ({ current: undefined as unknown as UpdateInstall }));
vi.mock("../../../utils/useUpdateInstall", () => ({ useUpdateInstall: () => installView.current }));

const settingsPageState = vi.hoisted(() => ({ current: undefined as unknown as SettingsPageState }));
vi.mock("../../../utils/useSettingsPage", () => ({ useSettingsPage: () => settingsPageState.current }));

vi.mock("./DesktopUpdateOutputDialog", () => ({
  DesktopUpdateOutputDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-output-dialog">
      <button type="button" onClick={onClose}>
        Close Mock Dialog
      </button>
    </div>
  ),
}));

const NOTHING_OFFERED: UpdateInstall = {
  answered: true,
  offered: false,
  version: null,
  waitReasons: [],
  pausedDownloads: 0,
  attempt: null,
  tryAgain: false,
  pressing: false,
  refusal: "",
  underWay: false,
  restarting: false,
  overdue: false,
  readFailed: false,
  install: vi.fn(),
};

const BASE_NOTICE: UpdateNoticeState = {
  available: true,
  newer: true,
  latestVersion: "1.1.0",
  currentVersion: "1.0.0",
  enabled: true,
  installedProgram: true,
  toastOwed: false,
  seen: false,
};

const NO_OUTCOME: UpdateOutcomeState = { announcement: null, failure: null, failureDismissed: false };

function makeSettingsState(over: Partial<SettingsPageState> = {}): SettingsPageState {
  return {
    url: "",
    hasToken: true,
    status: "",
    allowInsecureSsl: false,
    customHeaderNames: [],
    sgdbApiKey: "",
    saveUrl: vi.fn(),
    saveCustomHeaders: vi.fn(),
    setAllowInsecureSsl: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    saveSgdbKey: vi.fn(),
    removeSgdbKey: vi.fn(),
    saveSyncSettings: null,
    deviceInfo: null,
    syncing: false,
    syncStatus: "",
    registeredDevices: null,
    devicesLoading: false,
    devicesError: null,
    changeSaveSyncSetting: vi.fn(),
    toggleSaveSync: vi.fn(),
    submitDefaultSlot: vi.fn(),
    resetDefaultSlot: vi.fn(),
    syncAll: vi.fn(),
    steamInputMode: "default",
    applyingSteamInput: false,
    steamInputStatus: "",
    applySteamInput: vi.fn(),
    changeSteamInputMode: vi.fn(),
    preferredRegion: "",
    libraryRegions: [],
    platformGroups: true,
    namingMode: "merge",
    changePreferredRegion: vi.fn(),
    changePlatformGroups: vi.fn(),
    changeNamingMode: vi.fn(),
    update: BASE_NOTICE,
    updateOutcome: NO_OUTCOME,
    checkingForUpdate: false,
    updateCheckResult: "",
    checkForUpdateNow: vi.fn(),
    changeUpdateCheckEnabled: vi.fn(),
    logLevel: "warn",
    changeLogLevel: vi.fn(),
    ...over,
  };
}

describe("UpdatesTab", () => {
  beforeEach(() => {
    installView.current = { ...NOTHING_OFFERED, install: vi.fn() };
    settingsPageState.current = makeSettingsState();
  });

  describe("version rows", () => {
    it("renders section heading and version rows", () => {
      render(<UpdatesTab />);

      expect(screen.getByRole("heading", { name: UPDATES_HEADING })).toBeInTheDocument();
      expect(screen.getByText(INSTALLED_VERSION_LABEL)).toBeInTheDocument();
      expect(screen.getByTestId("updates-installed").textContent).toBe("1.0.0");
      expect(screen.getByText(AVAILABLE_VERSION_LABEL)).toBeInTheDocument();
      expect(screen.getByTestId("updates-available").textContent).toBe("1.1.0");
    });

    it("renders warning row when Tender is not an installed program", () => {
      settingsPageState.current = makeSettingsState({
        update: { ...BASE_NOTICE, installedProgram: false },
      });

      render(<UpdatesTab />);
      expect(screen.getByTestId("updates-not-installed").textContent).toBe(NOT_INSTALLED_PROGRAM);
    });

    it("displays unread state description when install state could not be read and button is absent", () => {
      installView.current = { ...NOTHING_OFFERED, readFailed: true };
      render(<UpdatesTab />);

      expect(screen.getByTestId("updates-install-unread")).toBeInTheDocument();
      expect(screen.getByTestId("updates-install-unread").textContent).toBe("Could not read the update state.");
    });
  });

  describe("daily check toggle and check now button", () => {
    it("renders daily check toggle with description and responds to toggle", async () => {
      const changeUpdateCheckEnabled = vi.fn();
      settingsPageState.current = makeSettingsState({ changeUpdateCheckEnabled });

      render(<UpdatesTab />);

      expect(screen.getByText(DAILY_CHECK_LABEL)).toBeInTheDocument();
      expect(screen.getByText(DAILY_CHECK_DESCRIPTION)).toBeInTheDocument();

      const toggle = screen.getByTestId("toggle-input");
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);
      expect(changeUpdateCheckEnabled).toHaveBeenCalledWith(false);
    });

    it("renders check now button and triggers check when clicked", async () => {
      const checkForUpdateNow = vi.fn();
      settingsPageState.current = makeSettingsState({ checkForUpdateNow });

      render(<UpdatesTab />);

      const button = screen.getByRole("button", { name: CHECK_NOW_LABEL });
      expect(button).toBeEnabled();

      await userEvent.click(button);
      expect(checkForUpdateNow).toHaveBeenCalledOnce();
    });

    it("disables check button and changes text to Checking… while checking", () => {
      settingsPageState.current = makeSettingsState({ checkingForUpdate: true });
      render(<UpdatesTab />);

      const button = screen.getByRole("button", { name: CHECKING_NOW_LABEL });
      expect(button).toBeDisabled();
    });

    it("renders update check result message when present", () => {
      settingsPageState.current = makeSettingsState({ updateCheckResult: "Tender is up to date." });
      render(<UpdatesTab />);

      expect(screen.getByTestId("updates-result").textContent).toBe("Tender is up to date.");
    });
  });

  describe("install button and wait reasons", () => {
    it("renders install button when offered and triggers install on click", async () => {
      const installFn = vi.fn();
      installView.current = {
        ...NOTHING_OFFERED,
        offered: true,
        version: "1.1.0",
        install: installFn,
      };

      render(<UpdatesTab />);

      const btn = screen.getByRole("button", { name: "Install update" });
      expect(btn).toBeEnabled();

      await userEvent.click(btn);
      expect(installFn).toHaveBeenCalledOnce();
    });

    it("renders wait reasons and disables install button when waiting", () => {
      installView.current = {
        ...NOTHING_OFFERED,
        offered: true,
        version: "1.1.0",
        waitReasons: [{ reason: "library_sync" }],
      };

      render(<UpdatesTab />);

      expect(screen.getByTestId("updates-waiting")).toBeInTheDocument();
      expect(screen.getByTestId("updates-wait-reason").textContent).toBe("Library sync");
      expect(screen.getByRole("button", { name: "Install update" })).toBeDisabled();
    });

    it("renders paused hint when downloads are paused", () => {
      installView.current = {
        ...NOTHING_OFFERED,
        offered: true,
        version: "1.1.0",
        pausedDownloads: 2,
      };

      render(<UpdatesTab />);

      expect(screen.getByTestId("updates-paused-hint").textContent).toBe("2 paused downloads will be cancelled.");
    });
  });

  describe("install progress and step status", () => {
    it("renders progress block with caption, elapsed time, and step marks", () => {
      installView.current = {
        ...NOTHING_OFFERED,
        underWay: true,
        attempt: {
          version: "1.1.0",
          step: "downloading",
          bytes_done: 50,
          bytes_total: 100,
          failure: null,
        },
      };

      render(<UpdatesTab />);

      expect(screen.getByTestId("updates-caption").textContent).toBe("Downloading 1.1.0");
      expect(screen.getByTestId("updates-step-download").dataset.status).toBe("current");
      expect(screen.getByTestId("updates-step-verify").dataset.status).toBe("pending");
      expect(screen.getByTestId("updates-step-check").dataset.status).toBe("pending");
      expect(screen.getByTestId("updates-step-install").dataset.status).toBe("pending");
      expect(screen.getByTestId("updates-note").textContent).toBe("Starting a game now cancels the update.");
    });
  });

  describe("failure block and output dialog", () => {
    it("renders failure card with Show what the installer said button", async () => {
      installView.current = {
        ...NOTHING_OFFERED,
        version: "1.1.0",
        attempt: {
          version: "1.1.0",
          step: "failed",
          bytes_done: 100,
          bytes_total: 100,
          failure: "installer_stopped",
        },
      };

      render(<UpdatesTab />);

      expect(screen.getByTestId("updates-caption").textContent).toBe(
        "Update to 1.1.0 failed — you are still on 1.0.0.",
      );
      const outputBtn = screen.getByRole("button", { name: SHOW_OUTPUT });
      expect(outputBtn).toBeInTheDocument();

      await userEvent.click(outputBtn);
      expect(screen.getByTestId("mock-output-dialog")).toBeInTheDocument();

      const closeBtn = screen.getByRole("button", { name: "Close Mock Dialog" });
      await userEvent.click(closeBtn);
      expect(screen.queryByTestId("mock-output-dialog")).toBeNull();
    });
  });
});
