import { describe, it, expect } from "vitest";
import {
  APPLY_TO_ALL_SHORTCUTS_LABEL,
  APPLYING_TO_ALL_SHORTCUTS_LABEL,
  CONTROLLER_HEADING,
  DEFAULT_SAVE_SLOT_DESCRIPTION,
  DEFAULT_SAVE_SLOT_LABEL,
  DEVICE_LABEL,
  EDIT_LABEL,
  ENABLE_SAVE_SYNC_CONFIRM,
  ENABLE_SAVE_SYNC_DESCRIPTION,
  ENABLE_SAVE_SYNC_LABEL,
  INSECURE_SSL_DESCRIPTION,
  INSECURE_SSL_LABEL,
  RESET_DEFAULT_SLOT_LABEL,
  SAVE_HISTORY_LIMIT_DESCRIPTION,
  SAVE_HISTORY_LIMIT_LABEL,
  SAVE_HISTORY_LIMIT_OPTIONS,
  SAVE_LABEL,
  SAVE_SYNC_DISABLED_DESCRIPTION,
  SAVE_SYNC_DISABLED_LABEL,
  SAVE_SYNC_HEADING,
  SIGN_OUT_CONFIRM,
  SIGN_OUT_DESCRIPTION,
  STEAM_INPUT_MODE_DESCRIPTION,
  STEAM_INPUT_MODE_LABEL,
  STEAM_INPUT_MODE_OPTIONS,
  SYNC_AFTER_EXIT_DESCRIPTION,
  SYNC_AFTER_EXIT_LABEL,
  SYNC_ALL_FAILED_STATUS,
  SYNC_ALL_SAVES_NOW_LABEL,
  SYNC_BEFORE_LAUNCH_DESCRIPTION,
  SYNC_BEFORE_LAUNCH_LABEL,
  SYNCING_ALL_LABEL,
  accountState,
  COLLECTION_NAMING_MODE_DESCRIPTION,
  COLLECTION_NAMING_MODE_LABEL,
  customHeadersSummary,
  defaultSaveSlotSummary,
  deviceRegisteredDescription,
  phraseText,
  PLATFORM_GROUPS_DESCRIPTION,
  PLATFORM_GROUPS_LABEL,
  PREFERRED_REGION_DESCRIPTION,
  PREFERRED_REGION_LABEL,
  sgdbKeyState,
  signInButtonLabel,
  STEAM_LIBRARY_HEADING,
} from "./settingsWording";

describe("phraseText", () => {
  it("joins a phrase's runs without their emphasis", () => {
    expect(phraseText([{ text: "a " }, { text: "b", strong: true }, { text: "." }])).toBe("a b.");
  });
});

describe("Save Sync", () => {
  it("labels the section and master switch", () => {
    expect(SAVE_SYNC_HEADING).toBe("Save Sync");
    expect(ENABLE_SAVE_SYNC_LABEL).toBe("Enable Save Sync");
    expect(ENABLE_SAVE_SYNC_DESCRIPTION).toBe("Sync RetroArch saves between this device and RomM server");
    expect(SAVE_SYNC_DISABLED_LABEL).toBe("Save sync is disabled");
    expect(SAVE_SYNC_DISABLED_DESCRIPTION).toBe("Enable above to configure sync settings");
  });

  it("describes the registered device", () => {
    expect(DEVICE_LABEL).toBe("Device");
    expect(deviceRegisteredDescription("Decky")).toBe('Registered as "Decky"');
  });

  it("labels sync before launch and sync after exit", () => {
    expect(SYNC_BEFORE_LAUNCH_LABEL).toBe("Sync before launch");
    expect(SYNC_BEFORE_LAUNCH_DESCRIPTION).toBe("Download newer saves from server before starting a game");
    expect(SYNC_AFTER_EXIT_LABEL).toBe("Sync after exit");
    expect(SYNC_AFTER_EXIT_DESCRIPTION).toBe("Upload changed saves to server after closing a game");
  });

  it("labels the default slot editor and summarizes slots", () => {
    expect(DEFAULT_SAVE_SLOT_LABEL).toBe("Default Save Slot");
    expect(DEFAULT_SAVE_SLOT_DESCRIPTION).toBe("Applies to new games and games without a per-game slot override");
    expect(defaultSaveSlotSummary("default")).toBe(
      "default — applies to new games and games without a per-game slot override",
    );
    expect(RESET_DEFAULT_SLOT_LABEL).toBe("Reset to default");
  });

  it("labels history limit and defines its options", () => {
    expect(SAVE_HISTORY_LIMIT_LABEL).toBe("Save History Limit");
    expect(SAVE_HISTORY_LIMIT_DESCRIPTION).toBe("Max save versions kept per slot on the server");
    expect(SAVE_HISTORY_LIMIT_OPTIONS).toEqual([
      { data: 5, label: "5" },
      { data: 10, label: "10 (Default)" },
      { data: 20, label: "20" },
      { data: 50, label: "50" },
    ]);
  });

  it("labels sync all saves and failure statuses", () => {
    expect(SYNC_ALL_SAVES_NOW_LABEL).toBe("Sync All Saves Now");
    expect(SYNCING_ALL_LABEL).toBe("Syncing...");
    expect(SYNC_ALL_FAILED_STATUS).toBe("Sync failed");
  });

  it("asks before turning save sync on, and says what it covers and what to do first", () => {
    expect(ENABLE_SAVE_SYNC_CONFIRM.title).toBe("Enable Save Sync?");
    expect(ENABLE_SAVE_SYNC_CONFIRM.confirm).toBe("I am sure");
    expect(ENABLE_SAVE_SYNC_CONFIRM.cancel).toBe("Cancel");
    const paragraphs = ENABLE_SAVE_SYNC_CONFIRM.description.split("\n\n");
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toContain("Tender keeps a game's saves in step with your RomM server");
    expect(paragraphs[1]).toContain("Tender keeps a copy of the old file");
    expect(paragraphs[2]).toContain("saves on the server belong to the user who uploaded them");
  });
});

describe("Connections", () => {
  it("labels the row buttons", () => {
    expect([EDIT_LABEL, SAVE_LABEL]).toEqual(["Edit", "Save"]);
  });

  it("counts the custom headers, or says there are none", () => {
    expect(customHeadersSummary(0)).toBe("(none)");
    expect(customHeadersSummary(2)).toBe("2 set");
  });

  it("says whether this device holds a token, and offers to sign in again when it does", () => {
    expect(accountState(true)).toBe("Signed in");
    expect(accountState(false)).toBe("Not signed in");
    expect(signInButtonLabel(true)).toBe("Sign in again");
    expect(signInButtonLabel(false)).toBe("Sign in");
  });

  it("says sign-out forgets the token here and leaves it valid in RomM", () => {
    expect(SIGN_OUT_DESCRIPTION).toBe("Forgets the RomM token on this device. The token stays valid in RomM.");
    expect(SIGN_OUT_CONFIRM).toEqual({
      title: "Sign out of RomM?",
      description:
        "This only forgets the RomM token on this device. The token itself stays valid in RomM — revoke it there " +
        "(Settings › API Tokens) if you no longer want it.",
      confirm: "Sign out",
      cancel: "Cancel",
    });
  });

  it("warns what insecure SSL exposes, word for word", () => {
    expect(INSECURE_SSL_LABEL).toBe("Allow Insecure SSL");
    expect(INSECURE_SSL_DESCRIPTION).toBe(
      "Skip certificate checks for a self-signed server. Anyone who can intercept the connection can read what " +
        "Tender sends — your RomM token, your password when you sign in with it, and any custom headers — and use " +
        "your account. Only on a network you trust.",
    );
  });

  it("masks a configured SteamGridDB key", () => {
    expect(sgdbKeyState("abc")).toBe("••••");
    expect(sgdbKeyState("")).toBe("Not configured");
  });
});

describe("Controller", () => {
  it("labels the section and Steam Input mode", () => {
    expect(CONTROLLER_HEADING).toBe("Controller");
    expect(STEAM_INPUT_MODE_LABEL).toBe("Steam Input Mode");
    expect(STEAM_INPUT_MODE_DESCRIPTION).toBe("Controls how Steam handles controller input for ROM shortcuts");
  });

  it("defines the Steam Input mode options", () => {
    expect(STEAM_INPUT_MODE_OPTIONS).toEqual([
      { data: "default", label: "Default (Recommended)" },
      { data: "force_on", label: "Force On" },
      { data: "force_off", label: "Force Off" },
    ]);
  });

  it("labels the apply button states", () => {
    expect(APPLY_TO_ALL_SHORTCUTS_LABEL).toBe("Apply to All Shortcuts");
    expect(APPLYING_TO_ALL_SHORTCUTS_LABEL).toBe("Applying to all shortcuts…");
  });
});

describe("Steam Library", () => {
  it("labels the section heading", () => {
    expect(STEAM_LIBRARY_HEADING).toBe("Steam Library");
  });

  it("labels and describes preferred region", () => {
    expect(PREFERRED_REGION_LABEL).toBe("Preferred region");
    expect(PREFERRED_REGION_DESCRIPTION).toBe(
      "When a game has several regional versions, prefer this region for the shortcut and its name. " +
        "Applies to games synced from now on; existing shortcuts keep their name.",
    );
  });

  it("labels and describes platform groups toggle", () => {
    expect(PLATFORM_GROUPS_LABEL).toBe("Show collection games in platform groups");
    expect(PLATFORM_GROUPS_DESCRIPTION).toBe(
      "When syncing a collection, also add its games to their platform-specific Steam group.",
    );
  });

  it("labels and describes collection naming mode toggle", () => {
    expect(COLLECTION_NAMING_MODE_LABEL).toBe("Distinguish collection types in Steam names");
    expect(COLLECTION_NAMING_MODE_DESCRIPTION).toBe(
      "Keeps collections that share a name apart in Steam instead of merging them: hand-picked collections " +
        "keep their plain name, and the other kinds get their type added, such as (Smart) or (Franchise). " +
        "Applies on the next sync.",
    );
  });
});
