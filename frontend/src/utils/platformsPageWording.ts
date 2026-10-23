/**
 * What the Library page's Platforms tab says, on both surfaces: the QAM page and
 * the desktop's Library tab. Each surface draws its own rows; the words in them
 * are this module's, the decisions behind which ones show
 * `utils/platformsPageView.ts`'s, and the BIOS states' words
 * `utils/biosSummary.ts`'s.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Library.
 */

import { biosSummary } from "./biosSummary";
import { pluralize } from "./pluralize";
import { SYNC_RUNNING_HINT } from "./syncRunning";
import type { PlatformRow, PlatformsPageState } from "./usePlatformsPage";

export interface ConfirmWords {
  readonly title: string;
  readonly description: string;
  readonly confirm: string;
  readonly cancel: string;
}

// --- The list ---

export const SYNCED_HEADING = "Synced";
export const AVAILABLE_HEADING = "Available";
export const ENABLE_ALL_LABEL = "Enable all";
export const DISABLE_ALL_LABEL = "Disable all";
export const PLATFORMS_FAILED = "Could not read your platforms. Check the connection to RomM and open the page again.";
export const NO_PLATFORMS = "RomM reports no platform holding any ROM.";
export const PICK_A_PLATFORM = "Pick a platform on the left.";

/**
 * What the row's BIOS dot means, in words — its `title`.
 *
 * **The BIOS states are not this module's to word.** `utils/biosSummary.ts`
 * holds all seven, and the list reads it as every other surface does. The list
 * once worded them for itself until it drifted: it went on saying an emulator
 * "requires none of the files it names" after the other surfaces had moved to
 * naming the declaration, so one platform was described in two vocabularies a
 * keypress apart.
 *
 * Of the module's two answers the row takes the `sentence`. The short `status`
 * is a heading and says what a colour means, which needs the heading beside it
 * to land; a tooltip has no heading and has room for the longer form, and the
 * pane it is meant to agree with shows both.
 *
 * What stays here are the three answers that are not BIOS states at all — they
 * are about the READ, which the module has no input for and no business knowing.
 * Each is taken off the STATE rather than off the payload being absent:
 * `firmware` is non-null in the `answered` state alone, so all three of these
 * share `firmware === null` and a truthiness test cannot tell them apart —
 * saying one thing about a row still waiting and a row whose read settled
 * nothing is how a reader takes an answer where none has arrived. A failed
 * RE-read keeps the answer it could not replace and the dot goes on showing it,
 * so only a failure with nothing behind it is worded as one — the pane is where
 * a kept answer is flagged as possibly out of date.
 */
export function biosTooltip(row: PlatformRow): string {
  if (row.firmwareState === "pending") return "Checking this platform's BIOS files…";
  if (row.firmwareState === "failed") return "Could not read this platform's BIOS state";
  const firmware = row.firmware;
  if (!firmware) return "Nothing is known about this platform's BIOS files";
  return biosSummary(firmware, firmware.files, firmware.bios_level ?? null, row.name || null).sentence;
}

// --- The detail's header ---

/**
 * The header's counts. Both halves count ROM FILES, which is what makes the
 * pair readable: one shortcut serves a whole sibling group and the game's page
 * switches versions across it, so a version that did not win the binding is
 * still reachable and still belongs on the right. Counting shortcuts there
 * instead read as "207 are missing" on a platform where nothing was. The Remove
 * button keeps the shortcut count — that one really is about Steam entries. An
 * unread Steam count drops its half.
 */
export const headerCounts = (row: PlatformRow): string =>
  `${row.romCount} on RomM${row.reachableCount === null ? "" : ` · ${row.reachableCount} in Steam`}`;

export const CORE_BUTTON_TITLE = "Emulator Core";

/** What the platform an action is working on is called, in the line saying why this one's buttons wait. */
export const busyPlatformName = (state: PlatformsPageState): string =>
  state.rows.get(state.busySlug ?? "")?.name ?? "another platform";

/**
 * The count is what failed, not the removal: taking the platform's games out of
 * Steam needs only the slug. So the line says the number is missing and stops
 * there — the buttons stay live.
 */
export const SHORTCUT_COUNTS_FAILED =
  "Could not read how many of these games are in Steam. Removing them still works, it just cannot say how many. " +
  "Reopen the page to try again.";

export const removalProgressLine = (removed: number, total: number): string => `Removing ${removed} of ${total}…`;

// --- BIOS files ---

export const BIOS_HEADING = "BIOS files";
export const BIOS_TABLE_HEADINGS = ["File", "On disk", "Contents"] as const;

/**
 * A failed RE-read keeps the answer it could not replace, so what is below is
 * the state from before whatever changed it — which is exactly where a reader
 * needs telling.
 */
export const BIOS_STALE =
  "Could not re-read the BIOS state, so what is below may be out of date. Pick the platform again to retry.";

/**
 * Three ways to have no rows, and they are three different sentences. A read
 * still out is a question nobody has answered yet — said as one, because the
 * alternative is the reader taking the silence for "nothing needed" on a
 * platform whose turn simply has not come. A read that did not come back is a
 * question that could not be asked. What is left is a finished answer: there is
 * nothing to manage here.
 */
export const BIOS_ABSENCE_LINE: Readonly<Record<"pending" | "failed" | "nothing", string>> = {
  pending: "Checking what this platform needs…",
  failed: "Could not read the BIOS state. Pick the platform again to retry.",
  nothing: "Nothing is known about this platform's BIOS files.",
};

/**
 * The route the summary cannot name: nothing here could say which files this
 * system wants, so the reader has to be told that placing one by hand still
 * works. The line used to open "BIOS management is not supported for this
 * system yet", which is a claim about the plugin and not what the state means:
 * install an emulator that declares firmware for this platform and the pane
 * answers, with nothing changed here.
 */
export const BY_HAND_LINE = "You can still put BIOS files in your BIOS folder by hand.";

export const unansweredLine = (count: number): string =>
  `${count === 1 ? "1 file" : `${count} files`} nothing installed could answer for. Report at ` +
  "github.com/danielcopper/romm-tender/issues if needed.";

export const DOWNLOAD_LABEL = "Download";
export const FAILED_LABEL = "Failed";
export const DOWNLOAD_ALL_LABEL = "Download all";
export const downloadRequiredLabel = (count: number): string => `Download required (${count})`;
export const deleteBiosLabel = (count: number): string => `Delete BIOS (${count})`;
export const DELETE_ROW_LABEL = "Delete";

/** *name* is the row's `delete_name`: what the delete takes, which can be another name than the row's. */
export const deleteRowConfirm = (name: string): ConfirmWords => ({
  title: `Delete ${name}?`,
  description: "Tender removes it from its firmware store and every link to it. Files you placed yourself stay.",
  confirm: "Delete",
  cancel: "Cancel",
});

export const REPLACE_ROW_LABEL = "Replace…";

/** *backupRoot* is the platform answer's `backup_root`, where the replaced file goes; `null` where it states none. */
export const replaceRowConfirm = (fileName: string, place: string, backupRoot: string | null): ConfirmWords => ({
  title: `Replace ${fileName}?`,
  description: `The file at ${place} goes to ${backupRoot ?? "the backup folder"}, and Tender's copy is linked in its place.`,
  confirm: "Replace",
  cancel: "Cancel",
});

export const deleteBiosConfirm = (platformName: string): ConfirmWords => ({
  title: `Delete BIOS files for ${platformName}?`,
  description: `Tender removes every BIOS file it downloaded for ${platformName} and every link to them. Files you placed yourself stay.`,
  confirm: "Delete BIOS Files",
  cancel: "Cancel",
});

// --- Removing ---

/** The removal button's label; an unread count drops the number. */
export const removeShortcutsLabel = (count: number | null): string =>
  count === null ? "Remove shortcuts" : `Remove ${pluralize(count, "shortcut")}`;

/** The save files' button: a number once it is read, the bare words while it is not. */
export const deleteSavesLabel = (count: number | null | undefined): string =>
  typeof count === "number" ? `Delete ${pluralize(count, "save file")}` : "Delete save files";

/** The removal confirmation's title. The count is interleaved with the
 *  platform's name, so this is the one of the three count labels `pluralize`
 *  cannot spell; an unread count drops the number rather than guessing one. */
function removeShortcutsTitle(row: PlatformRow): string {
  if (row.shortcutCount === null) return `Remove ${row.name} shortcuts?`;
  return `Remove ${row.shortcutCount} ${row.name} shortcut${row.shortcutCount === 1 ? "" : "s"}?`;
}

export const removeShortcutsConfirm = (row: PlatformRow): ConfirmWords => ({
  title: removeShortcutsTitle(row),
  description:
    "This takes this platform's games out of your Steam library. Downloaded ROM files and save files are left where " +
    "they are, and the games come back on the next sync while the platform stays enabled.",
  confirm: "Remove Shortcuts",
  cancel: "Cancel",
});

export const deleteSavesConfirm = (platformName: string): ConfirmWords => ({
  title: `Delete all save files for ${platformName}?`,
  description:
    "This will delete every local save file for ROMs on this platform. Any local changes that haven't been uploaded " +
    "to RomM yet will be lost permanently. Make sure saves are synced first.",
  confirm: "Delete Save Files",
  cancel: "Cancel",
});

/** The one read of the platform's five whose failure would otherwise say nothing. */
export const SAVE_COUNT_FAILED =
  "Could not read how many save files this platform holds. Pick the platform again to retry.";

/**
 * Only the shortcut removal is refused during a sync — the
 * `remove_platform_shortcuts` use case names the sync rule and
 * `delete_platform_saves` deliberately does not — so an unscoped sentence would
 * claim a restriction the backend does not impose. Scoped rather than refusing
 * the delete too: the sync rule is the authority on what a sync blocks, and
 * widening it to make a line true would be the tail wagging the dog.
 */
export const REMOVING_DURING_SYNC = `Removing shortcuts: ${SYNC_RUNNING_HINT}`;
