/**
 * What the Sync page draws, decided once for every surface that draws it: the
 * preview table's rows, the run's unit rows, the state of Force Full Sync and
 * the run history's notice. Each answer is data a surface renders in its own
 * look; the words are `syncPageWording.ts`'s.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Sync.
 */

import type { SyncPreview, SyncPreviewSummary, SyncProgress, SyncStats } from "../types";
import { pluralize } from "./pluralize";
import { previewHasChanges } from "./previewState";
import type { RunUnit } from "./runUnitsStore";
import {
  COLLECTIONS_ROW_NAME,
  NOT_SYNCED_NOTE,
  PLATFORM_COLLECTIONS_ROW_NAME,
  RUNS_NONE,
  RUNS_READING,
  RUNS_READ_FAILED,
  TOTAL_ROW_NAME,
  UNIT_DONE,
  UNIT_WAITING,
  collectionChangeLine,
  collectionNames,
  emptyPreviewSentence,
  platformCollectionCounts,
  unitStageText,
} from "./syncPageWording";
import type { SyncPageState } from "./useSyncPage";

/**
 * True when every platform this run spans is being re-fetched AND re-applied —
 * the derived "Force Full Sync" signal (#1318). After Force Full Sync every
 * platform loses its completion stamp, so ``restamp_platform_count`` equals
 * ``sync_platform_count``; and the recorded launch options are cleared, so the
 * whole library counts as ``changed``. The ``changed_count`` leg is what
 * separates a force from a first-ever sync — a fresh install is all-unstamped
 * too, but its delta is pure ``new_count``, so the odd wording is suppressed
 * there. A partial resume reads unequal; an absent count (older backend) is 0.
 */
export function isFullResync(s: SyncPreviewSummary): boolean {
  const platforms = s.sync_platform_count ?? 0;
  return platforms > 0 && (s.restamp_platform_count ?? 0) === platforms && s.changed_count > 0;
}

/** One row of the preview table. */
export interface PreviewRowModel {
  /** Unique within the table. */
  key: string;
  name: string;
  /** Said after the name, in the same cell. */
  inlineNote?: string | undefined;
  /** The full-width line under the cells. */
  subline?: string | undefined;
  /** The row's three game counts — new, updated, removed. Absent for a row
   *  counting something else, which draws `NO_COUNT` in each column and says
   *  what it changed on its subline. */
  counts?: [number, number, number] | undefined;
}

/**
 * What the preview's body is: a table, or the one sentence a preview with no
 * rows to draw says instead of a table of zeros.
 *
 * The table is one row per platform the backend reports a change for, one for
 * the RomM collections, one for the Steam collections kept per platform, and one
 * total — and the total comes from the summary's own counts rather than from
 * adding the rows up: the platform rows sum to it by construction, and the two
 * collection rows count collections rather than games, so they carry what
 * changed on a second line instead of in the columns. That leaves the total
 * reading zero over a preview whose only change is a collection, so
 * `beyondTheColumns` states what the columns cannot hold.
 */
export type PreviewBody =
  | {
      kind: "table";
      /** `null` where the backend sent no per-platform split: only the totals stand. */
      platformRows: PreviewRowModel[] | null;
      collectionRows: PreviewRowModel[];
      total: PreviewRowModel & { counts: [number, number, number] };
      beyondTheColumns: string | null;
    }
  | { kind: "empty"; sentence: string };

export function previewBody(preview: SyncPreview): PreviewBody {
  const summary = preview.summary;
  const names = collectionNames(summary);
  const totals: [number, number, number] = [summary.new_count, summary.changed_count, summary.remove_count];
  const collectionRows: PreviewRowModel[] = [];
  if (names !== null) collectionRows.push({ key: "collections", name: COLLECTIONS_ROW_NAME, subline: names });
  // The platform-collections row is offered on the backend's own `has_changes`,
  // which is the field the Apply button's condition reads too
  // (`previewHasChanges`). Keying the row on the counts instead would make it a
  // second reading of the same fact, free to drift from the button's.
  if (summary.platform_collection_diff?.has_changes === true) {
    collectionRows.push({
      key: "platform-collections",
      name: PLATFORM_COLLECTIONS_ROW_NAME,
      subline: platformCollectionCounts(summary) ?? undefined,
    });
  }
  if (totals[0] + totals[1] + totals[2] === 0 && collectionRows.length === 0) {
    return { kind: "empty", sentence: emptyPreviewSentence(summary, previewHasChanges(preview)) };
  }
  const breakdown = summary.platform_breakdown;
  return {
    kind: "table",
    platformRows:
      breakdown === undefined
        ? null
        : breakdown.map((row) => ({
            key: `platform:${row.slug}`,
            name: row.name,
            inlineNote: row.synced ? undefined : NOT_SYNCED_NOTE,
            counts: [row.new_count, row.changed_count, row.remove_count],
          })),
    collectionRows,
    total: { key: "total", name: TOTAL_ROW_NAME, counts: totals },
    beyondTheColumns: collectionChangeLine(summary),
  };
}

/** What a unit's apply has brought about so far — "4 added · 1 updated", with a
 *  zero part dropped. The em dash is "nothing yet", which for a finished unit is
 *  also the honest reading of a wholesale incremental skip: no shortcut was
 *  written, and the run never said why. */
export function unitOutcome(unit: RunUnit): string {
  const parts: string[] = [];
  if (unit.created > 0) parts.push(`${unit.created} added`);
  if (unit.updated > 0) parts.push(`${unit.updated} updated`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * What the plan holds for a unit the run has not reached.
 *
 * `predictedSkip` is a plan-time prediction and never the run's verdict
 * (ADR-0023), so it is worded as an expectation. The new-shortcut count is what
 * the reader is waiting on where the plan carried one; a collection or an older
 * backend carries none, and then the unit's ROM count is what can honestly be
 * said about it.
 */
export function unitPlan(unit: RunUnit): string {
  if (unit.predictedSkip) return "expected to skip";
  if (unit.newShortcutCount !== null && unit.newShortcutCount > 0) return `${unit.newShortcutCount} new`;
  return pluralize(unit.romCount, "ROM");
}

/** One row of the run's unit table. */
export interface RunUnitRowModel {
  /** Unique within the plan. */
  key: string;
  state: RunUnit["state"];
  /** The status cell's words; a running row also draws how far through the unit it is. */
  status: string;
  /** What the unit produced, or what the plan holds for it while it waits. */
  result: string;
}

/**
 * A unit's row. *stage* is the run's frame: exactly one unit runs at a time, so
 * the live position of the running row is the frame the whole page is already
 * reading — paired here rather than mirrored onto the row, which would re-render
 * every reader on every frame.
 */
export function runUnitRow(unit: RunUnit, stage: SyncProgress["stage"]): RunUnitRowModel {
  const key = `${unit.type}:${unit.id}`;
  if (unit.state === "done") return { key, state: "done", status: UNIT_DONE, result: unitOutcome(unit) };
  if (unit.state === "running")
    return { key, state: "running", status: unitStageText(stage), result: unitOutcome(unit) };
  return { key, state: "waiting", status: UNIT_WAITING, result: unitPlan(unit) };
}

/**
 * Whether the stats say there is nothing for Force Full Sync to forget.
 *
 * A read that has not answered says neither thing, and the two ways it can be
 * unanswered part here. While one is still coming the button waits for it —
 * not knowing is not evidence that there IS something to clear. Once one has
 * failed nothing further is coming, and a failed read is not an absence either:
 * the button goes live and the line beside it says the reading is missing,
 * because the alternative is a control the reader cannot press and cannot find
 * a reason for.
 */
export function nothingToClear(stats: SyncStats | null, statsFailed: boolean): boolean {
  if (stats !== null) return !stats.last_sync && !stats.last_attempt;
  return !statsFailed;
}

/**
 * Whether Force Full Sync can be pressed. Drawn and disabled rather than hidden:
 * a button that vanishes takes the reader's place with it. Three things stop the
 * press — a run in flight, a clear already made (pressing again would forget what
 * is already forgotten), and stats saying there is nothing recorded to forget.
 */
export function forceFullSyncBlocked(state: SyncPageState): boolean {
  return state.run.running || state.fullSyncCleared !== null || nothingToClear(state.stats, state.statsFailed);
}

/**
 * The line under Force Full Sync, which explains the state the button is in
 * rather than describing the press in the abstract.
 *
 * Ordered by what stops the press: a run in flight, then the clear already
 * made, then the stats — unread, unreadable, or holding nothing to forget.
 */
export function forceFullSyncNote(state: SyncPageState): string {
  if (state.run.running) return "Not while a run is in flight.";
  if (state.fullSyncCleared !== null) return `${state.fullSyncCleared}. Pressing again would clear nothing.`;
  if (state.stats === null) {
    return state.statsFailed
      ? "Could not read what has already been synced — this still clears it."
      : "Reading what has already been synced…";
  }
  if (nothingToClear(state.stats, state.statsFailed))
    return "Nothing has been synced yet, so there is nothing to forget.";
  return "Forgets what was synced and rebuilds everything next run.";
}

/**
 * The line the run history shows besides its rows, or `null`. A failed read is
 * said, and the rows already held stay: they were true when they were read, and
 * an emptied list would read as "no runs".
 */
export function runHistoryNotice(state: SyncPageState): string | null {
  if (state.runsFailed) return RUNS_READ_FAILED;
  if (state.runs.length > 0) return null;
  return state.runsLoading ? RUNS_READING : RUNS_NONE;
}
