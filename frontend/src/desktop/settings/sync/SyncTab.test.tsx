// What this file pins is the desktop drawing of the Sync page: which of the
// three bodies leads, what each draws from the shared state, and that every
// press reaches the same `useSyncPage` action the QAM page's does. The actions'
// own behaviour — what a refusal or a rejection leaves on screen — is pinned
// once, through the QAM page, in `bigpicture/SyncPage.test.tsx`.

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as backend from "../../../api/backend";
import type { SessionBudgetStatus, SyncPlanUnit, SyncPreview, SyncPreviewSummary, SyncStats } from "../../../types";
import { adoptPreview, resetPendingPreviewStoreForTests } from "../../../utils/pendingPreviewStore";
import { attachRunUnitsMirror, resetRunUnitsStoreForTests, seedRunUnits } from "../../../utils/runUnitsStore";
import * as runningApps from "../../../utils/runningApps";
import * as syncManager from "../../../utils/syncManager";
import { resetSyncProgressStoreForTests, setSyncProgress } from "../../../utils/syncProgress";
import { resetSyncStatsStoreForTests } from "../../../utils/syncStatsStore";
import { SyncTab } from "./SyncTab";

vi.mock("../../../utils/syncManager", () => ({
  requestSyncCancel: vi.fn(),
  reconcileStaleShortcuts: vi.fn().mockResolvedValue(undefined),
  isCancelRequested: vi.fn().mockReturnValue(false),
  resetSyncCancel: vi.fn(),
}));

vi.mock("../../../utils/runningApps", () => ({ isAnyAppRunning: vi.fn(() => false) }));

vi.mock("../../../utils/steamRestart", () => ({ restartSteam: vi.fn() }));

const stats = (over: Partial<SyncStats> = {}): SyncStats => ({
  last_sync: "2026-07-11T17:48:00",
  platforms: 3,
  collections: 1,
  roms: 120,
  total_shortcuts: 120,
  ...over,
});

const budget = (over: Partial<SessionBudgetStatus> = {}): SessionBudgetStatus => ({
  success: true,
  rss_kb: 1_200_000,
  warn_kb: 1_800_000,
  ceiling_kb: 2_200_000,
  cliff_kb: 2_450_000,
  memory_delta_kb: 300_000,
  resume_ready: null,
  run_done_items: null,
  run_total_items: null,
  ...over,
});

const summary = (over: Partial<SyncPreviewSummary> = {}): SyncPreviewSummary => ({
  new_count: 13,
  changed_count: 3,
  unchanged_count: 0,
  remove_count: 6,
  disabled_platform_remove_count: 0,
  ...over,
});

const preview = (over: Partial<SyncPreview> = {}): SyncPreview => ({
  success: true,
  summary: summary({
    platform_breakdown: [
      { slug: "snes", name: "SNES", synced: true, new_count: 13, changed_count: 3, remove_count: 6 },
    ],
  }),
  new_names: [],
  changed_names: [],
  preview_id: "p1",
  ...over,
});

const planUnit = (over: Partial<SyncPlanUnit>): SyncPlanUnit =>
  ({ id: 1, type: "platform", name: "PlayStation", rom_count: 40, ...over }) as SyncPlanUnit;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });

const button = (name: string): HTMLElement => screen.getByRole("button", { name });

async function renderTab() {
  const result = render(<SyncTab />);
  await flush();
  return result;
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(button(name));
    await Promise.resolve();
  });
  await flush();
}

attachRunUnitsMirror();

beforeEach(() => {
  vi.resetAllMocks();
  resetSyncStatsStoreForTests();
  resetPendingPreviewStoreForTests();
  resetRunUnitsStoreForTests();
  resetSyncProgressStoreForTests();
  vi.mocked(syncManager.isCancelRequested).mockReturnValue(false);
  vi.mocked(syncManager.reconcileStaleShortcuts).mockResolvedValue(undefined);
  vi.mocked(runningApps.isAnyAppRunning).mockReturnValue(false);
  vi.mocked(backend.getSettings).mockResolvedValue({ skip_preview: false } as Awaited<
    ReturnType<typeof backend.getSettings>
  >);
  vi.mocked(backend.getSyncStats).mockResolvedValue(stats());
  vi.mocked(backend.getSessionBudgetStatus).mockResolvedValue(budget());
  vi.mocked(backend.getPendingPreview).mockResolvedValue({ success: true, preview: null });
  vi.mocked(backend.getSyncRuns).mockResolvedValue({ success: true, runs: [] });
  vi.mocked(backend.syncPreview).mockResolvedValue(preview());
  vi.mocked(backend.syncApplyDelta).mockResolvedValue({ success: true, message: "" });
  vi.mocked(backend.syncCancelPreview).mockResolvedValue({ success: true, message: "" });
  vi.mocked(backend.cancelSync).mockResolvedValue({ success: true, message: "Cancelled" });
  vi.mocked(backend.clearSyncCache).mockResolvedValue({ success: true, message: "Cleared" });
  vi.mocked(backend.saveSkipPreview).mockResolvedValue({ success: true });
});

describe("nothing pending", () => {
  it("says so and offers the button that works out a preview", async () => {
    await renderTab();

    expect(
      screen.getByText("Nothing is waiting to be applied. Start a preview to see what would change."),
    ).toBeVisible();
    expect(button("Check for changes")).toBeEnabled();
  });

  it("works out a preview on the press, and draws what it would change as a table", async () => {
    await renderTab();
    await press("Check for changes");

    expect(backend.syncPreview).toHaveBeenCalledTimes(1);
    const table = screen.getByTestId("preview-table");
    const rows = within(table)
      .getAllByRole("row")
      .map((row) => row.textContent);
    expect(rows).toEqual(["PlatformNewUpdatedRemoved", "SNES1336", "Total1336"]);
    expect(button("Apply Sync")).toBeEnabled();
  });
});

describe("a pending preview", () => {
  it("applies the preview it shows", async () => {
    adoptPreview(preview());
    await renderTab();
    await press("Apply Sync");

    expect(backend.syncApplyDelta).toHaveBeenCalledWith("p1");
  });

  it("ends the preview on both sides on Cancel, and goes back to the start button", async () => {
    adoptPreview(preview());
    await renderTab();
    await press("Cancel");

    expect(backend.syncCancelPreview).toHaveBeenCalledTimes(1);
    expect(button("Check for changes")).toBeVisible();
  });

  it("discards the preview before working out a fresh one on Refresh", async () => {
    adoptPreview(preview());
    await renderTab();
    await press("Refresh");

    expect(backend.syncCancelPreview).toHaveBeenCalledTimes(1);
    expect(backend.syncPreview).toHaveBeenCalledTimes(1);
  });

  it("says a preview with no rows in one sentence, and keeps Apply dead", async () => {
    adoptPreview(preview({ summary: summary({ new_count: 0, changed_count: 0, remove_count: 0 }) }));
    await renderTab();

    expect(screen.getByText("Everything is up to date.")).toBeVisible();
    expect(screen.queryByTestId("preview-table")).toBeNull();
    expect(button("Apply Sync")).toBeDisabled();
  });

  it("warns that a large run will likely pause", async () => {
    adoptPreview(preview({ pause_likely: true }));
    await renderTab();

    expect(screen.getByTestId("budget-advisory")).toHaveTextContent(/Will likely pause partway/);
  });
});

describe("a run in flight", () => {
  beforeEach(() => {
    seedRunUnits(
      [
        planUnit({ id: 1, name: "PlayStation", new_shortcut_count: 4 }),
        planUnit({ id: 2, type: "collection", name: "Favourites", rom_count: 12 }),
      ],
      "run-live",
    );
    setSyncProgress({
      running: true,
      stage: "applying",
      step: 1,
      totalSteps: 2,
      current: 1,
      total: 4,
      message: "PlayStation: 1/4",
      runId: "run-live",
    });
  });

  it("leads with the run, its units and Cancel Sync, and hides the session-budget card", async () => {
    vi.mocked(backend.getSyncStats).mockResolvedValue(
      stats({ last_attempt: { finished_at: "2026-07-11T18:02:00", status: "paused" } }),
    );
    await renderTab();

    expect(screen.getByText("Sync running")).toBeVisible();
    expect(screen.getByTestId("progress")).toBeInTheDocument();
    expect(screen.getByTestId("run-unit-collection-2")).toHaveTextContent("Favourites · collection");
    expect(screen.queryByText("Check for changes")).toBeNull();
    expect(screen.queryByTestId("budget-paused")).toBeNull();
  });

  it("cancels the run it shows", async () => {
    await renderTab();
    await press("Cancel Sync");

    expect(backend.cancelSync).toHaveBeenCalledWith("run-live");
    expect(button("Cancelling…")).toBeDisabled();
  });
});

describe("the session-budget card", () => {
  it("asks for a Steam restart while a paused run waits for memory, naming the start button", async () => {
    vi.mocked(backend.getSyncStats).mockResolvedValue(
      stats({ last_attempt: { finished_at: "2026-07-11T18:02:00", status: "paused" } }),
    );
    vi.mocked(backend.getSessionBudgetStatus).mockResolvedValue(budget({ rss_kb: 2_199_000 }));
    await renderTab();

    const card = screen.getByTestId("budget-paused");
    expect(card).toHaveTextContent("Sync paused");
    expect(card).toHaveTextContent("Restart Steam, then Check for changes.");
    expect(within(card).getByRole("button", { name: "Restart Steam now" })).toBeEnabled();
  });

  it("will not restart Steam over a running game, and says why", async () => {
    vi.mocked(runningApps.isAnyAppRunning).mockReturnValue(true);
    vi.mocked(backend.getSessionBudgetStatus).mockResolvedValue(budget({ rss_kb: 2_000_000 }));
    await renderTab();

    const card = screen.getByTestId("budget-high-heap");
    expect(within(card).getByRole("button", { name: "Restart Steam now" })).toBeDisabled();
    expect(card).toHaveTextContent("Close your running game first");
  });
});

describe("the options", () => {
  it("saves Skip preview, and the start button then names the run", async () => {
    await renderTab();
    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle-input"));
      await Promise.resolve();
    });
    await flush();

    expect(backend.saveSkipPreview).toHaveBeenCalledWith(true);
    expect(button("Sync Library")).toBeVisible();
  });

  it("asks before Force Full Sync, and clears only on yes", async () => {
    await renderTab();
    await press("Force Full Sync");

    const dialog = screen.getByRole("dialog", { name: "Force a full re-sync?" });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await Promise.resolve();
    });
    expect(backend.clearSyncCache).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();

    await press("Force Full Sync");
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Force Full Sync" }));
      await Promise.resolve();
    });
    await flush();

    expect(backend.clearSyncCache).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cleared. Pressing again would clear nothing.")).toBeVisible();
  });

  it("keeps Force Full Sync dead with nothing recorded to forget, and says so", async () => {
    vi.mocked(backend.getSyncStats).mockResolvedValue(stats({ last_sync: null }));
    await renderTab();

    expect(button("Force Full Sync")).toBeDisabled();
    expect(screen.getByText("Nothing has been synced yet, so there is nothing to forget.")).toBeVisible();
  });
});

describe("Steam memory and the run history", () => {
  it("reads Steam's memory now and the last run's change", async () => {
    await renderTab();

    expect(screen.getByTestId("memory-now")).toHaveTextContent("1.2 GB");
    expect(screen.getByTestId("memory-last-run")).toHaveTextContent("+0.3");
  });

  it("lists the recorded runs with what each covered", async () => {
    vi.mocked(backend.getSyncRuns).mockResolvedValue({
      success: true,
      runs: [
        {
          id: "r1",
          started_at: "2026-07-11T09:41:00",
          finished_at: "2026-07-11T09:55:00",
          status: "errored",
          platforms_planned: 3,
          roms_planned: 100,
          platforms_completed: ["a"],
          collections_completed: null,
          error: "RomM unreachable",
        },
      ],
    });
    await renderTab();

    expect(screen.getByTestId("run-r1")).toHaveTextContent("errored");
    expect(screen.getByTestId("run-r1")).toHaveTextContent("1 of 3 platforms · RomM unreachable");
  });

  it("says a run history it could not read", async () => {
    vi.mocked(backend.getSyncRuns).mockResolvedValue({ success: false, reason: "x", message: "x" } as never);
    await renderTab();

    expect(screen.getByText("Could not read the run history. Open the page again to try.")).toBeVisible();
  });
});
