import { describe, it, expect } from "vitest";
import {
  HIGH_HEAP_KB,
  formatGb,
  formatSignedGb,
  memoryLevel,
  sessionBudgetCard,
  type SessionBudgetCardInput,
} from "./sessionBudget";

describe("formatGb", () => {
  it("renders KB as one-decimal decimal-GB", () => {
    expect(formatGb(2252712)).toBe("2.3 GB");
    expect(formatGb(1900000)).toBe("1.9 GB");
    expect(formatGb(440000)).toBe("0.4 GB");
  });
});

describe("formatSignedGb", () => {
  it("prefixes an explicit sign and drops the unit (rendered inline after the GB reading)", () => {
    expect(formatSignedGb(800000)).toBe("+0.8");
    expect(formatSignedGb(-300000)).toBe("-0.3");
    expect(formatSignedGb(0)).toBe("+0.0");
  });
});

describe("memoryLevel", () => {
  const WARN = 1_800_000;
  const CEIL = 2_200_000;
  it("is fine up to the warn floor, high strictly above it, full at/above the ceiling", () => {
    expect(memoryLevel(WARN, WARN, CEIL)).toBe("fine");
    expect(memoryLevel(WARN + 1, WARN, CEIL)).toBe("high");
    expect(memoryLevel(CEIL - 1, WARN, CEIL)).toBe("high");
    expect(memoryLevel(CEIL, WARN, CEIL)).toBe("full");
  });
});

// The card's every sentence is pinned through the Big Picture banner that draws
// it (`bigpicture/SessionBudgetBanner.test.tsx`); what is pinned here is the
// decision a second drawing would read: which card, and whether it offers the
// restart.
describe("sessionBudgetCard", () => {
  const paused = (over: Partial<SessionBudgetCardInput> = {}): SessionBudgetCardInput => ({
    lastAttemptStatus: "paused",
    syncButton: { label: "Resume Sync", resumes: true },
    rssKb: 2_199_000,
    ...over,
  });

  it("is the paused card offering the restart while memory is still full", () => {
    expect(sessionBudgetCard(paused())).toMatchObject({ kind: "paused", title: "Sync paused", offersRestart: true });
  });

  it("withdraws the restart once memory is free for the resume", () => {
    expect(sessionBudgetCard(paused({ resumeReady: true }))).toMatchObject({ kind: "paused", offersRestart: false });
  });

  it("is the high-heap card above the advisory after a run that was not paused, and nothing at it", () => {
    const after = (rssKb: number | null) =>
      sessionBudgetCard({
        lastAttemptStatus: "completed",
        syncButton: { label: "Sync Library", resumes: false },
        rssKb,
      });
    expect(after(HIGH_HEAP_KB + 1)).toMatchObject({ kind: "high-heap", offersRestart: true });
    expect(after(HIGH_HEAP_KB)).toBeNull();
    expect(after(null)).toBeNull();
  });
});
