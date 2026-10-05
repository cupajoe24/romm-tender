/**
 * What the settings say, on both surfaces: the QAM's Settings page and the
 * desktop's Tender Settings window. Each surface draws its own rows; the words
 * in them are this module's.
 */

/** A sentence with some of its words emphasised — each surface draws a `strong` run in its own bold. */
export type Phrase = readonly { readonly text: string; readonly strong?: boolean }[];

/** A phrase's words without their emphasis. */
export const phraseText = (phrase: Phrase): string => phrase.map((run) => run.text).join("");

// --- Connections: RomM ---

export const ROMM_HEADING = "RomM";
export const EDIT_LABEL = "Edit";
export const SAVE_LABEL = "Save";

export const ROMM_URL_LABEL = "RomM URL";
export const ROMM_URL_UNSET = "(not set)";

export const CUSTOM_HEADERS_LABEL = "Custom headers";
export const customHeadersSummary = (count: number): string => (count > 0 ? `${count} set` : "(none)");

export const ROMM_ACCOUNT_LABEL = "RomM Account";
export const accountState = (hasToken: boolean): string => (hasToken ? "Signed in" : "Not signed in");
export const signInButtonLabel = (hasToken: boolean): string => (hasToken ? "Sign in again" : "Sign in");

export const SIGN_OUT_LABEL = "Sign out";
export const SIGN_OUT_DESCRIPTION = "Forgets the RomM token on this device. The token stays valid in RomM.";

// Sign-out only forgets the token on this device; it never revokes it in RomM.
export const SIGN_OUT_CONFIRM = {
  title: "Sign out of RomM?",
  description:
    "This only forgets the RomM token on this device. The token itself stays valid in RomM — " +
    "revoke it there (Settings → API Tokens) if you no longer want it.",
  confirm: SIGN_OUT_LABEL,
  cancel: "Cancel",
} as const;

export const INSECURE_SSL_LABEL = "Allow Insecure SSL";
export const INSECURE_SSL_DESCRIPTION =
  "Skip certificate checks for a self-signed server. Anyone who can intercept the connection can read what the " +
  "plugin sends — your RomM token, your password when you sign in with it, and any custom headers — and use your " +
  "account. Only on a network you trust.";

// --- Save Sync ---

export const ENABLE_SAVE_SYNC_CONFIRM = {
  title: "Enable Save Sync?",
  description:
    "This will sync your RetroArch game saves between this device and your RomM server. " +
    "Save sync covers the per-game save files RetroArch writes for the systems it supports " +
    "- SRAM, RTC, EEPROM, and other per-system formats, not a single file type. " +
    "Coverage varies by system; see the save sync support matrix in the docs.\n\n" +
    "Before enabling, please back up your local save files. " +
    "They are stored in your RetroArch/RetroDECK saves directory.\n\n" +
    "Save sync follows RetroArch's own save sorting, so no setting is required: when you " +
    "change how RetroArch sorts saves into folders, each game's save files are moved to " +
    "the new folder the next time the plugin touches that game's saves. Saves RetroArch writes next to the " +
    'game file ("Write Saves to Content Directory") are not synced.\n\n' +
    "Also make sure you are not using this on a shared RomM account " +
    "(e.g. admin, romm, guest) - unless you know what you are doing. " +
    "Save sync is intended for single user accounts.\n\n" +
    "Are you sure you want to proceed?",
  confirm: "I am sure",
  cancel: "Cancel",
} as const;

// --- Connections: SteamGridDB ---

export const SGDB_HEADING = "SteamGridDB";
export const SGDB_KEY_LABEL = "API Key";
export const sgdbKeyState = (maskedKey: string): string => (maskedKey ? "••••" : "Not configured");
