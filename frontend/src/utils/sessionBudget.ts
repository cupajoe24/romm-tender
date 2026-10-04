/**
 * What the session-budget card says and when it is shown, and how a memory
 * reading is written — every word and threshold of it, one home for every
 * surface that draws the card or the reading. The drawing stays with each
 * surface; a colour is a surface's own mapping of {@link MemoryLevel}.
 */

import type { SyncButton } from "./syncResume";

/**
 * Live renderer RSS (KB) above which a completed run recommends a Steam restart.
 * Matches the backend ``domain.session_budget.POST_RUN_ADVISORY_KB`` (#1383).
 */
export const HIGH_HEAP_KB = 1_800_000;

/**
 * Format a KB reading as a one-decimal, decimal-GB string (1 GB = 1e6 KB), e.g.
 * ``2252712 → "2.3 GB"``. Standard rounding.
 */
export function formatGb(kb: number): string {
  return `${(kb / 1_000_000).toFixed(1)} GB`;
}

/**
 * Format a signed KB delta as a one-decimal, unit-less decimal-GB string with an
 * explicit ``+``/``-`` sign, e.g. ``+800000 → "+0.8"``, ``-300000 → "-0.3"``. Zero
 * (and anything rounding to it) reads ``+0.0``. The GB unit is dropped because the
 * reading is rendered inline right after the unit-carrying live reading
 * ("0.6 GB · last run +0.7"), so repeating "GB" would read redundantly (#1383).
 */
export function formatSignedGb(kb: number): string {
  const gb = kb / 1_000_000;
  return `${gb >= 0 ? "+" : "-"}${Math.abs(gb).toFixed(1)}`;
}

/** How full Steam's memory is, as the reader is shown it. */
export type MemoryLevel = "full" | "high" | "fine";

/**
 * Read a live memory reading against the backend-supplied thresholds (no
 * frontend magic numbers, #1383): full at/above the pause ceiling (every further
 * chunk would pause), high strictly above the advisory floor (the same strict
 * trigger as the high-heap card and the backend advisory), else fine.
 */
export function memoryLevel(rssKb: number, warnKb: number, ceilingKb: number): MemoryLevel {
  if (rssKb >= ceilingKb) return "full";
  if (rssKb > warnKb) return "high";
  return "fine";
}

export interface SessionBudgetCardInput {
  /** ``stats.last_attempt?.status`` — a ``"paused"`` last run shows the paused card. */
  lastAttemptStatus?: string | undefined;
  /**
   * The sync button this card points the user at. Required, and deliberately not
   * defaulted: a card that guessed would be free to guess wrong, which is the
   * defect it exists to prevent. Pausedness and resumability are different facts —
   * a paused run stays paused after a Force Full Sync, it just has nothing left to
   * resume from — so this does not replace {@link lastAttemptStatus}.
   */
  syncButton: SyncButton;
  /** Live renderer RSS in KB from ``get_session_budget_status``; ``null`` when unreadable. */
  rssKb: number | null;
  /**
   * ``resume_ready`` from ``get_session_budget_status`` — ``true`` once the live
   * reading is low enough that resuming a paused run would proceed (e.g. after a
   * Steam restart). Flips the paused card from "restart Steam first" to "memory
   * is free, press the sync button" and withdraws the restart offer.
   * ``false``/``null`` keeps the restart guidance.
   */
  resumeReady?: boolean | null | undefined;
  /**
   * ``run_done_items`` from ``get_session_budget_status`` — how many of the paused
   * run's games are already done. ``null``/absent when the backend doesn't know (a
   * backend restart wipes the in-memory counters), which drops the progress sentence.
   */
  runDoneItems?: number | null | undefined;
  /** ``run_total_items`` — the denominator of {@link runDoneItems}; the sentence needs both. */
  runTotalItems?: number | null | undefined;
}

export interface SessionBudgetCard {
  /** ``paused`` is the info card, ``high-heap`` the warning one. */
  kind: "paused" | "high-heap";
  title: string;
  body: string;
  /** Whether the card offers {@link RESTART_STEAM_LABEL}: not once memory is free for a resume. */
  offersRestart: boolean;
}

export const RESTART_STEAM_LABEL = "Restart Steam now";

/** Why the restart is not offered while a game runs: a restart would close it. */
export const RESTART_BLOCKED_BY_GAME = "Close your running game first — restarting Steam would close it.";

/**
 * The session-budget card (#1383): the paused card while the last run is
 * ``paused`` — restart Steam, then press whatever the sync button currently says
 * ({@link SyncButton}) — or the high-heap card when the live renderer heap is high
 * after a completed run. A paused run takes precedence (it is high-heap anyway).
 * ``null`` when neither applies. When ``rssKb`` is ``null`` (measurement
 * unavailable) the live number is dropped but the guidance text stays.
 */
export function sessionBudgetCard({
  lastAttemptStatus,
  syncButton,
  rssKb,
  resumeReady,
  runDoneItems,
  runTotalItems,
}: SessionBudgetCardInput): SessionBudgetCard | null {
  if (lastAttemptStatus !== "paused") {
    if (rssKb == null || rssKb <= HIGH_HEAP_KB) return null;
    return {
      kind: "high-heap",
      title: "Steam memory is high",
      body: `Steam memory is high: ${formatGb(rssKb)} of 2.4 GB — restart Steam before further large syncs.`,
      offersRestart: true,
    };
  }

  // Once the live reading says a resume would proceed (e.g. after a Steam restart),
  // the paused card announces memory is free and the restart button is pointless.
  const memoryFreedForResume = resumeReady === true;

  const liveReadingSuffix = rssKb != null ? ` (${formatGb(rssKb)})` : "";
  // How far the paused run got. The counts come from the backend — which keeps
  // running across the Steam restart the card asks for — but a plugin/backend
  // reload wipes them (in-memory, by design). Then, and whenever the total is
  // unknown or zero, the sentence is dropped entirely rather than rendered with
  // placeholders or zeros.
  //
  // It is also dropped when nothing can be resumed. "1200 of 2001 games done" is a
  // statement about work the NEXT run will not repeat, and once the completion
  // stamps are gone the next run repeats all of it — so after a Force Full Sync the
  // sentence would claim exactly the false head start the button no longer offers.
  const progressSentence =
    syncButton.resumes && runDoneItems != null && runTotalItems != null && runTotalItems > 0
      ? ` ${runDoneItems} of ${runTotalItems} games done.`
      : "";
  // The instruction names the button by quoting what the page put on it. Both
  // branches must name SOMETHING pressable: the memory reading is the card's
  // subject, but the action is why the user is reading it.
  const pressInstruction = syncButton.resumes
    ? `Press ${syncButton.label} to continue.`
    : `Press ${syncButton.label} to start over.`;
  return {
    kind: "paused",
    title: "Sync paused",
    body: memoryFreedForResume
      ? `Steam memory is free again${liveReadingSuffix}.${progressSentence} ${pressInstruction}`
      : `Steam memory is full${liveReadingSuffix}.${progressSentence} Restart Steam, then ${syncButton.label}.`,
    offersRestart: !memoryFreedForResume,
  };
}
