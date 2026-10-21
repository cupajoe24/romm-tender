import type { PrunePreviewItem } from "../api/backend";
import type { PruneComplete, PruneGroupResult, PruneProgress } from "./pruneStore";

export const RESULT_LOST_MESSAGE = "The cleanup result was lost — check your library and run the scan again.";

/** What Cancel can and cannot promise — the running group is never rolled back. */
export const CANCEL_HINT =
  "Stops before the next game. The one being processed now finishes and reports what it changed.";

/** Shown once Stop was pressed, so a second press never looks necessary. */
export const CANCELLING_HINT = "Stopping — finishing the current safe step, then reporting what changed.";

export const plural = (count: number, singular: string, pluralForm: string): string =>
  count === 1 ? singular : pluralForm;

export function formatBinaryBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

export const formatBytes = formatBinaryBytes;

/**
 * The backend's stage slugs in the words the user reads — one entry per
 * emit_progress call site in services/prune/, and no others.
 * An unknown stage falls back to its slug with underscores opened up.
 */
export const STAGE_LABELS: Record<string, string> = {
  checking: "Checking with RomM",
  creating_recovery: "Backing up",
  recovery_sealed: "Backup complete",
  removing_shortcut: "Removing the Steam shortcut",
  removing: "Removing local data",
  removed: "Done",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

/** What the Confirm button says: pressed, then the run's current stage, then its resting label. */
export function confirmButtonLabel(starting: boolean, progress: PruneProgress | null): string {
  if (starting) return "Starting...";
  if (progress) return `${progress.stage.replace(/_/g, " ")}...`;
  return "Confirm Cleanup";
}

/** Why the scan button is unavailable, or nothing when it is not. */
export function scanButtonDescription(syncRunning: boolean, runActive: boolean): string | undefined {
  if (syncRunning) return "Unavailable while a library sync is running.";
  if (runActive) return "A cleanup is running. Its progress is shown below.";
  return undefined;
}

/** How many rows a group actually removed, however the frame reported it. */
export function removedInGroup(item: { removed_count?: number; removed_rom_ids?: number[] }): number {
  return item.removed_count ?? item.removed_rom_ids?.length ?? 0;
}

/** How many of a group's warnings the backend left out at its per-group cap. */
export function omittedWarnings(item: PruneGroupResult): number {
  return item.warnings_omitted ? Math.max(0, (item.warning_count ?? 0) - (item.warnings?.length ?? 0)) : 0;
}

/** The finished run's line on Data Management: what went wrong or warned, and how many warnings were left out. */
export function completionDescription(complete: PruneComplete): string {
  const shown = complete.results.filter((item) => item.status !== "removed" || (item.warnings?.length ?? 0) > 0);
  return [
    complete.message,
    ...shown.flatMap((item) => [
      item.message,
      ...(item.warnings ?? []).map((warning) => `Warning: ${warning}`),
      omittedWarnings(item) > 0 ? `${omittedWarnings(item)} additional warning(s) omitted.` : "",
    ]),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What a row's Verdict cell says, and the sentence it is short for.
 */
export function verdictFor(item: PrunePreviewItem): { short: string; full: string } {
  const ofGroup = item.group_size > 1 ? ` · one of ${item.group_size}` : "";
  if (item.candidate) {
    return {
      short: `Gone from RomM${ofGroup}`,
      full: "Gone from RomM — removed once the server confirms it.",
    };
  }
  return {
    short: `Still on RomM${ofGroup}`,
    full: "Still on RomM at your last sync. Removed only if the final check finds every version of this game gone — then the whole game goes, Steam shortcut included.",
  };
}

/** What tells two versions of one game apart: their id, and the file where it says more than the name. */
export function versionLine(item: PrunePreviewItem, name: string): string {
  return item.fs_name && item.fs_name !== name ? `ROM ${item.rom_id} · ${item.fs_name}` : `ROM ${item.rom_id}`;
}

export interface ConfirmBlockedState {
  completed: boolean;
  runInFlight: boolean;
  allEntriesLoaded: boolean;
  loaded: number;
  total: number;
  pageLoadFailed: boolean;
  destructiveConfirmed: boolean;
  insufficientSpace: boolean;
  unknownSelectedSize: boolean;
  anyOptionChosen: boolean;
}

export interface ConfirmBlockedResult {
  text: string;
  aboutList: boolean;
}

/**
 * Why Confirm is unavailable, in the user's words.
 */
export function confirmBlockedReason(state: ConfirmBlockedState): ConfirmBlockedResult | null {
  const other = (text: string): ConfirmBlockedResult => ({ text, aboutList: false });
  if (state.completed) return null;
  if (state.runInFlight) return other("A cleanup is already running.");
  if (!state.allEntriesLoaded) {
    return {
      text: state.pageLoadFailed
        ? `The list stopped loading at ${state.loaded} of ${state.total} entries. Retry loading before confirming.`
        : `The list is still loading (${state.loaded} of ${state.total} entries). A cleanup can start once every entry has arrived.`,
      aboutList: true,
    };
  }
  if (!state.destructiveConfirmed) return other("Confirm you understand there will be no recovery bundle.");
  if (state.insufficientSpace) {
    return other(
      state.unknownSelectedSize
        ? "A selected ROM's size can't be measured, so the recovery bundle can't be guaranteed to fit."
        : "The selected ROM content doesn't fit in the free space at the recovery target.",
    );
  }
  if (!state.anyOptionChosen) return other("Choose at least one cleanup option above.");
  return null;
}
