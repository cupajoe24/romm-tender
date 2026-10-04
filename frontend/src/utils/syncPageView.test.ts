import { describe, it, expect } from "vitest";
import type { SyncPreview, SyncPreviewSummary, SyncRunRecord, SyncStats } from "../types";
import type { RunUnit } from "./runUnitsStore";
import {
  forceFullSyncBlocked,
  forceFullSyncNote,
  isFullResync,
  nothingToClear,
  previewBody,
  runHistoryNotice,
  runUnitRow,
  unitPlan,
} from "./syncPageView";
import type { SyncPageState } from "./useSyncPage";

const summary = (over: Partial<SyncPreviewSummary> = {}): SyncPreviewSummary =>
  ({ new_count: 0, changed_count: 0, remove_count: 0, ...over }) as SyncPreviewSummary;

const preview = (over: Partial<SyncPreviewSummary> = {}, extra: Partial<SyncPreview> = {}): SyncPreview =>
  ({ success: true, preview_id: "p1", summary: summary(over), ...extra }) as SyncPreview;

const unit = (over: Partial<RunUnit> = {}): RunUnit =>
  ({
    type: "platform",
    id: "snes",
    name: "SNES",
    state: "waiting",
    created: 0,
    updated: 0,
    romCount: 3,
    newShortcutCount: null,
    predictedSkip: false,
    ...over,
  }) as RunUnit;

/** The page state, holding only what these decisions read. */
const pageState = (over: Partial<SyncPageState> = {}): SyncPageState =>
  ({
    run: { running: false },
    stats: { last_sync: "2026-10-01T00:00:00Z", last_attempt: null } as unknown as SyncStats,
    statsFailed: false,
    fullSyncCleared: null,
    runs: [],
    runsLoading: false,
    runsFailed: false,
    ...over,
  }) as SyncPageState;

describe("previewBody", () => {
  it("draws a row per platform and a total from the summary's own counts", () => {
    const body = previewBody(
      preview({
        new_count: 5,
        changed_count: 1,
        remove_count: 0,
        platform_breakdown: [
          { slug: "snes", name: "SNES", synced: true, new_count: 5, changed_count: 0, remove_count: 0 },
          { slug: "gba", name: "GBA", synced: false, new_count: 0, changed_count: 1, remove_count: 0 },
        ],
      } as Partial<SyncPreviewSummary>),
    );
    expect(body).toMatchObject({
      kind: "table",
      platformRows: [
        { name: "SNES", counts: [5, 0, 0], inlineNote: undefined },
        { name: "GBA", counts: [0, 1, 0], inlineNote: "not synced as a platform" },
      ],
      collectionRows: [],
      total: { name: "Total", counts: [5, 1, 0] },
      beyondTheColumns: null,
    });
  });

  it("answers no platform rows, and keeps the total, when the backend sent no split", () => {
    expect(previewBody(preview({ new_count: 2 }))).toMatchObject({ kind: "table", platformRows: null });
  });

  it("carries collection changes on rows of their own, said under the total", () => {
    const body = previewBody(
      preview({
        collection_diff: { has_changes: true, added: ["Favourites"], removed: [] },
        platform_collection_diff: { has_changes: true, added_count: 2, removed_count: 0 },
      } as Partial<SyncPreviewSummary>),
    );
    expect(body).toMatchObject({
      kind: "table",
      collectionRows: [
        { name: "Collections", subline: "Added: Favourites" },
        { name: "Platform collections", subline: "Added: 2" },
      ],
      beyondTheColumns: "plus 1 collection added, 2 platform collections changed",
    });
  });

  it("is one sentence where there is no row to draw", () => {
    expect(previewBody(preview())).toEqual({ kind: "empty", sentence: "Everything is up to date." });
  });
});

describe("isFullResync", () => {
  it("is every platform re-stamped with something changed, and not a first sync", () => {
    expect(isFullResync(summary({ sync_platform_count: 2, restamp_platform_count: 2, changed_count: 4 }))).toBe(true);
    expect(isFullResync(summary({ sync_platform_count: 2, restamp_platform_count: 2, new_count: 4 }))).toBe(false);
    expect(isFullResync(summary({ sync_platform_count: 2, restamp_platform_count: 1, changed_count: 4 }))).toBe(false);
  });
});

describe("runUnitRow", () => {
  it("says what a finished unit produced", () => {
    expect(runUnitRow(unit({ state: "done", created: 4, updated: 1 }), "applying")).toMatchObject({
      status: "done",
      result: "4 added · 1 updated",
    });
  });

  it("says the running unit's stage from its own point of view", () => {
    expect(runUnitRow(unit({ state: "running" }), "applying")).toMatchObject({
      status: "applying shortcuts",
      result: "—",
    });
    expect(runUnitRow(unit({ state: "running" }), "")).toMatchObject({ status: "working" });
  });

  it("says what the plan holds for a unit not yet reached", () => {
    expect(runUnitRow(unit(), "fetching")).toMatchObject({ status: "waiting", result: "3 ROMs" });
    expect(unitPlan(unit({ newShortcutCount: 2 }))).toBe("2 new");
    expect(unitPlan(unit({ predictedSkip: true }))).toBe("expected to skip");
  });
});

describe("Force Full Sync", () => {
  it("waits for a stats read still coming, and goes live on one that failed", () => {
    expect(nothingToClear(null, false)).toBe(true);
    expect(nothingToClear(null, true)).toBe(false);
  });

  it("is blocked by a run in flight, by a clear already made, and by nothing recorded", () => {
    expect(forceFullSyncBlocked(pageState())).toBe(false);
    expect(forceFullSyncBlocked(pageState({ run: { running: true } as SyncPageState["run"] }))).toBe(true);
    expect(forceFullSyncBlocked(pageState({ fullSyncCleared: "Cleared" }))).toBe(true);
    expect(forceFullSyncBlocked(pageState({ stats: { last_sync: null, last_attempt: null } as SyncStats }))).toBe(true);
  });

  it("explains the state the button is in, in the order the press is stopped", () => {
    expect(forceFullSyncNote(pageState({ run: { running: true } as SyncPageState["run"] }))).toBe(
      "Not while a run is in flight.",
    );
    expect(forceFullSyncNote(pageState({ fullSyncCleared: "Cleared" }))).toBe(
      "Cleared. Pressing again would clear nothing.",
    );
    expect(forceFullSyncNote(pageState({ stats: null, statsFailed: true }))).toBe(
      "Could not read what has already been synced — this still clears it.",
    );
    expect(forceFullSyncNote(pageState())).toBe("Forgets what was synced and rebuilds everything next run.");
  });
});

describe("runHistoryNotice", () => {
  const run = { id: "r1" } as SyncRunRecord;

  it("says a failed read even over rows already held, which stay", () => {
    expect(runHistoryNotice(pageState({ runsFailed: true, runs: [run] }))).toBe(
      "Could not read the run history. Open the page again to try.",
    );
  });

  it("says a first read is under way, and that there are no runs once it answered none", () => {
    expect(runHistoryNotice(pageState({ runsLoading: true }))).toBe("Reading the run history…");
    expect(runHistoryNotice(pageState())).toBe("No sync has run yet.");
    expect(runHistoryNotice(pageState({ runsLoading: true, runs: [run] }))).toBeNull();
  });
});
