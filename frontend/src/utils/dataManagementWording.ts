/**
 * Wording for the Data Management page and desktop settings tab: descriptions,
 * disclaimers, action labels, confirmations, and table headings.
 *
 * Sourced from Big Picture's Data Management page and detail panes, with
 * shared definitions for both Big Picture and Desktop surfaces.
 */

import { pluralize } from "./pluralize";

export const DATA_MANAGEMENT_TITLE = "Data Management";

// --- Shortcuts ---
export const SHORTCUTS_DESCRIPTION =
  "The Steam entries Tender created for your RomM games. Removing them leaves downloaded ROM files and save files where they are; the next sync puts the shortcuts back.";
export const REMOVE_ALL_SHORTCUTS_LABEL = "Remove all shortcuts";
export const REMOVE_ALL_SHORTCUTS_CONFIRM = "Remove every RomM shortcut?";
export const REMOVE_ALL_SHORTCUTS_TITLE = "Remove all shortcuts?";
export const REMOVE_ALL_SHORTCUTS_CONFIRM_DESC =
  "Remove every RomM shortcut? Downloaded ROM files and saves are left where they are; the next sync puts the shortcuts back.";

// --- Installed ROMs ---
export const ROM_FILES_DESCRIPTION =
  "The ROMs Tender downloaded to your device, one per install — a game you keep two versions of is two of these. Removing them keeps every shortcut, so the games stay in your library and can be downloaded again.";
export const ROM_FILES_SIZE_NOTE =
  "The size is what your RomM server reported for these installs, not a measurement of your disk.";
export const UNINSTALL_ALL_ROMS_LABEL = "Uninstall all ROM files";
export const UNINSTALL_ALL_ROMS_CONFIRM = "Delete every downloaded ROM file?";
export const UNINSTALL_ALL_ROMS_TITLE = "Uninstall all ROM files?";
export const UNINSTALL_ALL_ROMS_CONFIRM_DESC =
  "Delete every downloaded ROM file? Every shortcut stays in your library so the games can be downloaded again.";

// --- Grid Images ---
export const GRID_IMAGES_DESCRIPTION =
  "Steam keeps the images it shows for a shortcut after the shortcut is gone. These are the leftovers: images whose shortcut no longer exists. Images of games still in your library — including games Tender did not add — are kept.";
export const SCAN_GRID_IMAGES_LABEL = "Scan for orphaned images";
export const SCANNING_GRID_IMAGES_LABEL = "Scanning…";
export const removeGridImagesLabel = (count: number): string => `Remove ${pluralize(count, "orphaned image")}`;
export const removeGridImagesConfirm = (count: number): string => `Remove ${pluralize(count, "image")}?`;
export const REMOVE_GRID_IMAGES_TITLE = "Remove orphaned images?";
export const removeGridImagesConfirmDesc = (count: number): string =>
  `Remove ${pluralize(count, "orphaned grid image")}? Leftover images from shortcuts that no longer exist will be deleted.`;

// --- Other non-Steam games ---
export const NON_STEAM_DESCRIPTION =
  "Everything in your Steam library that neither Steam nor Tender installed — emulators, launchers, browsers, games you added by hand. Your RomM games are not counted here; they are counted under Tender's shortcuts. The whitelist below protects what you keep; everything else is what the button removes.";
export const NON_STEAM_FAILED_MSG =
  "Steam's shortcut list could not be read, so nothing here can be told apart from your RomM games. Nothing is removed while that is true — open the page again to retry.";
export const RETRODECK_AT_RISK_WARNING = "WARNING: RetroDECK not protected! Remove";
export const RETRODECK_ARMED_WARNING = "!! RETRODECK WILL BE REMOVED !! Press to confirm";
export const RETRODECK_PERMANENT_REMOVAL_NOTE = "RetroDECK is NOT in the whitelist and will be permanently removed!";
export const RETRODECK_DANGER_TITLE = "RetroDECK Will Be Removed!";
export const RETRODECK_DANGER_DESC =
  "RetroDECK is NOT in your whitelist and will be permanently removed! This will break every game Tender launches through RetroDECK.\n\nAre you sure you want to proceed?";
export const removeNonSteamLabel = (count: number): string => `Remove ${pluralize(count, "non-Steam game")}`;
export const REMOVE_NON_STEAM_TITLE = "Remove non-Steam games?";
export const removeNonSteamConfirmDesc = (count: number, whitelisted: number): string =>
  `Remove ${pluralize(count, "non-Steam game")} (${whitelisted} whitelisted)? Everything not in the whitelist will be removed from Steam.`;

// --- Gone from RomM ---
export const REMOVED_GAMES_DESCRIPTION =
  "Games whose entry is gone from your RomM server while this device still holds their shortcut, downloaded files and saves. The review below scans for them and shows what removing each one would take with it.";
export const REMOVED_GAMES_SCAN_FAILED = "The scan failed — press Clean Up Removed RomM Games to try again.";

// --- Recovery Bundles ---
export const recoveryBundlesDescription = (root?: string): string =>
  `Before the cleanup deletes a game's local data it seals a snapshot of it${root ? `, in ${root}` : ""}. Nothing is ever read back automatically and nothing here removes one — they are yours to keep, move or delete in a file manager.`;
export const RECOVERY_BUNDLES_EMPTY_NOTE =
  "Nothing has been sealed under that folder. Bundles an older version wrote elsewhere are not counted here.";
export const RECOVERY_BUNDLES_PRESENT_NOTE =
  "Each carries a README explaining what it holds. Bundles an older version sealed under a different folder are not counted here.";
export const RECOVERY_TABLE_HEADINGS = ["Game", "Sealed", "Size"] as const;
