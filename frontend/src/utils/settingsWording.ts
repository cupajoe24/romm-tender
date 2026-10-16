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
    "revoke it there (Settings › API Tokens) if you no longer want it.",
  confirm: SIGN_OUT_LABEL,
  cancel: "Cancel",
} as const;

export const INSECURE_SSL_LABEL = "Allow Insecure SSL";
export const INSECURE_SSL_DESCRIPTION =
  "Skip certificate checks for a self-signed server. Anyone who can intercept the connection can read what " +
  "Tender sends — your RomM token, your password when you sign in with it, and any custom headers — and use your " +
  "account. Only on a network you trust.";

// --- Save Sync ---

export const SAVE_SYNC_HEADING = "Save Sync";

export const ENABLE_SAVE_SYNC_LABEL = "Enable Save Sync";
export const ENABLE_SAVE_SYNC_DESCRIPTION = "Sync RetroArch saves between this device and RomM server";

export const SAVE_SYNC_DISABLED_LABEL = "Save sync is disabled";
export const SAVE_SYNC_DISABLED_DESCRIPTION = "Enable above to configure sync settings";

export const DEVICE_LABEL = "Device";
export const deviceRegisteredDescription = (name: string): string => `Registered as "${name}"`;

export const SYNC_BEFORE_LAUNCH_LABEL = "Sync before launch";
export const SYNC_BEFORE_LAUNCH_DESCRIPTION = "Download newer saves from server before starting a game";

export const SYNC_AFTER_EXIT_LABEL = "Sync after exit";
export const SYNC_AFTER_EXIT_DESCRIPTION = "Upload changed saves to server after closing a game";

export const DEFAULT_SAVE_SLOT_LABEL = "Default Save Slot";
export const DEFAULT_SAVE_SLOT_DESCRIPTION = "Applies to new games and games without a per-game slot override";
export const defaultSaveSlotSummary = (slot: string): string =>
  `${slot} — applies to new games and games without a per-game slot override`;

export const RESET_DEFAULT_SLOT_LABEL = "Reset to default";

export const SAVE_HISTORY_LIMIT_LABEL = "Save History Limit";
export const SAVE_HISTORY_LIMIT_DESCRIPTION = "Max save versions kept per slot on the server";

export interface HistoryLimitOption {
  readonly data: number;
  readonly label: string;
}

export const SAVE_HISTORY_LIMIT_OPTIONS: readonly HistoryLimitOption[] = [
  { data: 5, label: "5" },
  { data: 10, label: "10 (Default)" },
  { data: 20, label: "20" },
  { data: 50, label: "50" },
];

export const SYNC_ALL_SAVES_NOW_LABEL = "Sync All Saves Now";
export const SYNCING_ALL_LABEL = "Syncing...";
export const SYNC_ALL_FAILED_STATUS = "Sync failed";

export const ENABLE_SAVE_SYNC_CONFIRM = {
  title: "Enable Save Sync?",
  description:
    "Tender keeps a game's saves in step with your RomM server: before a game starts it fetches a newer " +
    "save from the server, after you quit it uploads yours, and if both sides changed you choose which one " +
    "wins. Which files make up a game's save is asked of the emulator that launches it, game by game; a game " +
    "whose save it cannot tell apart from others, such as a shared memory card or a save inside the game " +
    "file, is left alone.\n\n" +
    "Before a save on this device is overwritten, Tender keeps a copy of the old file.\n\n" +
    "Use this with your own RomM account, not a shared one such as admin or guest: saves on the server " +
    "belong to the user who uploaded them.",
  confirm: "I am sure",
  cancel: "Cancel",
} as const;

// --- Connections: SteamGridDB ---

export const SGDB_HEADING = "SteamGridDB";
export const SGDB_KEY_LABEL = "API Key";
export const sgdbKeyState = (maskedKey: string): string => (maskedKey ? "••••" : "Not configured");

// --- Controller ---

export const CONTROLLER_HEADING = "Controller";

export const STEAM_INPUT_MODE_LABEL = "Steam Input Mode";
export const STEAM_INPUT_MODE_DESCRIPTION = "Controls how Steam handles controller input for ROM shortcuts";

export interface SteamInputModeOption {
  readonly data: "default" | "force_on" | "force_off";
  readonly label: string;
}

export const STEAM_INPUT_MODE_OPTIONS: readonly SteamInputModeOption[] = [
  { data: "default", label: "Default (Recommended)" },
  { data: "force_on", label: "Force On" },
  { data: "force_off", label: "Force Off" },
];

export const APPLY_TO_ALL_SHORTCUTS_LABEL = "Apply to All Shortcuts";
export const APPLYING_TO_ALL_SHORTCUTS_LABEL = "Applying to all shortcuts…";

// --- Steam Library ---

export const STEAM_LIBRARY_HEADING = "Steam Library";

export const PREFERRED_REGION_LABEL = "Preferred region";
export const PREFERRED_REGION_DESCRIPTION =
  "When a game has several regional versions, prefer this region for the shortcut and its name. " +
  "Applies to games synced from now on; existing shortcuts keep their name.";

export const PLATFORM_GROUPS_LABEL = "Show collection games in platform groups";
export const PLATFORM_GROUPS_DESCRIPTION =
  "When syncing a collection, also add its games to their platform-specific Steam group.";

export const COLLECTION_NAMING_MODE_LABEL = "Distinguish collection types in Steam names";
export const COLLECTION_NAMING_MODE_DESCRIPTION =
  "Keeps collections that share a name apart in Steam instead of merging them: hand-picked collections " +
  "keep their plain name, and the other kinds get their type added, such as (Smart) or (Franchise). " +
  "Applies on the next sync.";

// --- Updates ---

export const UPDATES_HEADING = "Updates";

export const INSTALLED_VERSION_LABEL = "Installed";
export const AVAILABLE_VERSION_LABEL = "Available";

export const DAILY_CHECK_LABEL = "Check for updates daily";
export const DAILY_CHECK_DESCRIPTION = "Asks GitHub at most once a day whether a newer release is out.";

export const CHECK_NOW_LABEL = "Check now";
export const CHECKING_NOW_LABEL = "Checking…";

// --- Advanced ---

export const ADVANCED_HEADING = "Advanced";

export const LOG_LEVEL_LABEL = "Log Level";
export const LOG_LEVEL_DESCRIPTION = "Controls how much detail Tender writes to its log";

export interface LogLevelOption {
  readonly data: "error" | "warn" | "info" | "debug";
  readonly label: string;
}

export const LOG_LEVEL_OPTIONS: readonly LogLevelOption[] = [
  { data: "error", label: "Error" },
  { data: "warn", label: "Warn (default)" },
  { data: "info", label: "Info" },
  { data: "debug", label: "Debug" },
];
