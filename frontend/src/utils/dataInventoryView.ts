/**
 * Pure calculations, formatters, and view helpers for the Data Management
 * inventory rows, detail figures, whitelist toggling, and bundle ordering.
 *
 * Sourced from Big Picture's DataManagementPage and DataDetail, shared across
 * both Big Picture and Desktop surfaces.
 */

import type { RecoveryBundleEntry } from "../types";
import type { DataRowId } from "./dataRows";
import { fuzzyMatch } from "./fuzzyMatch";
import { pluralize } from "./pluralize";
import {
  DEFAULT_WHITELIST_PATTERNS,
  type DataPageState,
  type NonSteamApp,
  type PageRead,
  type ScannedCount,
} from "./useDataPage";

/**
 * What a row's count slot says: a figure, `—` for a read that failed, or `null`
 * while the read is still in flight (which the slot draws as a spinner).
 *
 * A figure that costs a round trip or a backend scan reads `scan` until the
 * reader asks for it.
 */
export function rowCount(id: DataRowId, state: DataPageState): string | null {
  switch (id) {
    case "shortcuts":
      return figure(state.shortcutCount, (count) => count);
    case "rom-files":
      return figure(state.inventory, (inventory) => inventory.installed_roms);
    case "grid-images":
      return scanned(state.orphanedGridImages);
    case "non-steam":
      return figure(state.foreignApps, (apps) => apps.length);
    case "removed-games":
      return scanned(state.removedGames);
    case "recovery-bundles":
      return figure(state.inventory, (inventory) => inventory.recovery_bundles);
  }
}

export function figure<T>(read: PageRead<T>, count: (value: T) => number): string | null {
  if (read.state === "reading") return null;
  if (read.state === "failed") return "—";
  return `${count(read.value)}`;
}

export function scanned(read: ScannedCount): string | null {
  return read.state === "not-asked" ? "scan" : figure(read, (count) => count);
}

/**
 * A pane's figure line for an initial load: `Reading…` while in flight,
 * failure message if failed, and formatted figure once answered.
 */
export function figureLine<T>(read: PageRead<T>, what: string, answer: (value: T) => string): string {
  if (read.state === "reading") return "Reading…";
  if (read.state === "failed") return `${what} could not be read — open the page again to retry.`;
  return answer(read.value);
}

/**
 * Figure line for orphaned grid images scan state.
 */
export function gridImagesFigures(read: ScannedCount): string | null {
  switch (read.state) {
    case "not-asked":
      return "Not scanned yet";
    case "reading":
      return null;
    case "failed":
      return "The scan failed — press Scan for orphaned images to try again.";
    case "answered":
      return `${pluralize(read.value, "orphaned image")} found`;
  }
}

/**
 * Figure line for other non-Steam games inventory state.
 */
export function nonSteamFigures(
  read: PageRead<NonSteamApp[]>,
  whitelistedCount: number,
  toRemoveCount: number,
): string {
  if (read.state === "reading") return "Reading…";
  if (read.state === "failed") return "Could not be read";
  if (read.value.length === 0) return "No other non-Steam games found";
  return `${read.value.length} ${read.value.length === 1 ? "entry" : "entries"} · ${whitelistedCount} protected · ${toRemoveCount} would be removed`;
}

/**
 * Notification message when some non-Steam shortcuts could not be resolved by Steam in time.
 */
export function nonSteamUnidentifiedMessage(count: number): string {
  return count === 1
    ? "1 entry could not be identified — Steam did not answer for it in time. It is not in the count above and nothing here will remove it; open the page again to retry."
    : `${count} entries could not be identified — Steam did not answer for them in time. They are not in the count above and nothing here will remove them; open the page again to retry.`;
}

/**
 * Newest first, and a bundle whose folder names no day after every one that does.
 */
export function newestFirst(a: RecoveryBundleEntry, b: RecoveryBundleEntry): number {
  if (a.day !== b.day) {
    if (a.day === null) return 1;
    if (b.day === null) return -1;
    return a.day < b.day ? 1 : -1;
  }
  return a.name.localeCompare(b.name);
}

/**
 * Whether a game name matches any default protective whitelist pattern.
 */
export function isDefaultPatternMatch(name: string): boolean {
  const lower = name.toLowerCase();
  return DEFAULT_WHITELIST_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Updates disabled default patterns and custom whitelist entries when toggling protection for a non-Steam app.
 */
export function toggleWhitelistApp(
  app: NonSteamApp,
  checked: boolean,
  currentDisabled: readonly string[],
  currentCustom: readonly string[],
): { disabledDefaults: string[]; customNames: string[] } {
  const matchingPattern = DEFAULT_WHITELIST_PATTERNS.find((p) => app.name.toLowerCase().includes(p));
  let newDisabled = [...currentDisabled];
  let newCustom = [...currentCustom];

  if (checked) {
    if (matchingPattern && newDisabled.includes(matchingPattern)) {
      newDisabled = newDisabled.filter((p) => p !== matchingPattern);
    } else if (!matchingPattern && !newCustom.includes(app.name)) {
      newCustom.push(app.name);
    }
  } else {
    if (matchingPattern && !newDisabled.includes(matchingPattern)) {
      newDisabled.push(matchingPattern);
    }
    newCustom = newCustom.filter((n) => n !== app.name);
  }

  return { disabledDefaults: newDisabled, customNames: newCustom };
}

/**
 * Filters the list of foreign non-Steam apps by search query using fuzzy matching.
 */
export function filterForeignApps(apps: readonly NonSteamApp[], search: string): NonSteamApp[] {
  if (!search) return [...apps];
  return apps.filter((app) => fuzzyMatch(search, app.name));
}
