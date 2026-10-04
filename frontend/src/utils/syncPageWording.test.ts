import { describe, it, expect } from "vitest";
import type { SyncPreviewSummary, SyncRunRecord } from "../types";
import {
  formatRunCoverage,
  idleLine,
  noUnitsLine,
  previewDeadlineNote,
  previewEstimateLine,
  previewHint,
  runHistorySubline,
  runProgressNote,
} from "./syncPageWording";
import type { SyncRunView } from "./syncRunView";

const runView = (over: Partial<SyncRunView>): SyncRunView =>
  ({ totalSteps: 0, step: 0, etaText: null, hasFineDetail: false, fineDetailText: "", ...over }) as SyncRunView;

const runRecord = (over: Partial<SyncRunRecord>): SyncRunRecord =>
  ({
    platforms_planned: 3,
    platforms_completed: ["a", "b", "c"],
    collections_completed: null,
    error: null,
    ...over,
  }) as SyncRunRecord;

describe("idleLine", () => {
  it("quotes the start button's name when the press starts the run", () => {
    expect(idleLine(true, "Resume Sync")).toBe(
      "Nothing is waiting to be applied. Skip preview is on, so Resume Sync applies changes without showing them first.",
    );
    expect(idleLine(false, "Check for changes")).toBe(
      "Nothing is waiting to be applied. Start a preview to see what would change.",
    );
  });
});

describe("the preview's lines", () => {
  it("names the deadline, or nothing without one", () => {
    expect(previewDeadlineNote(true, 0)).toBe("expired");
    expect(previewDeadlineNote(false, null)).toBeNull();
    expect(previewDeadlineNote(false, 120)).toMatch(/^expires in /);
  });

  it("adds the sleep caveat only to a long run", () => {
    expect(previewHint(599)).toBe("Progress is saved about every 200 games — cancelling is safe.");
    expect(previewHint(600)).toMatch(/Long syncs pause during sleep; keep the Deck powered\.$/);
  });

  it("puts the scope before the estimate, and drops a scope it was not sent", () => {
    const scoped = { sync_platform_count: 3, sync_collection_count: 2 } as SyncPreviewSummary;
    expect(previewEstimateLine(scoped, 60)).toMatch(/^Syncing 3 platforms · 2 collections · estimated duration /);
    expect(previewEstimateLine({} as SyncPreviewSummary, 60)).toMatch(/^estimated duration /);
  });
});

describe("the run's lines", () => {
  it("says where the run has got, or nothing with neither a step nor an estimate", () => {
    expect(runProgressNote(runView({ totalSteps: 16, step: 3, etaText: "about 2 min left" }))).toBe(
      "unit 3 of 16 · about 2 min left",
    );
    expect(runProgressNote(runView({}))).toBeNull();
  });

  it("falls back to the frame's fine detail without a plan, and to a sentence without either", () => {
    expect(noUnitsLine(runView({ hasFineDetail: true, fineDetailText: "SNES: 4 of 9" }))).toBe("SNES: 4 of 9");
    expect(noUnitsLine(runView({}))).toBe("Per-unit detail is not available for this run.");
  });
});

describe("the run history's lines", () => {
  it("counts what a run covered, and what it planned where it recorded nothing", () => {
    expect(formatRunCoverage(runRecord({}))).toBe("3 platforms");
    expect(formatRunCoverage(runRecord({ platforms_completed: ["a"] }))).toBe("1 of 3 platforms");
    expect(formatRunCoverage(runRecord({ platforms_completed: null }))).toBe("3 platforms planned");
    expect(formatRunCoverage(runRecord({ platforms_planned: 0, platforms_completed: [] }))).toBe("nothing completed");
  });

  it("adds the error a run ended with", () => {
    expect(runHistorySubline(runRecord({ error: "RomM unreachable" }))).toBe("3 platforms · RomM unreachable");
  });
});
