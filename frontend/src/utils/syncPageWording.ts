/**
 * The words of the Sync page: every heading, label and sentence Tender writes on
 * it, and the functions that write a sentence from what the page holds. One home,
 * so every surface that draws the page says the same thing the same way; the
 * drawing stays with each surface. The session-budget card's words are
 * `sessionBudget.ts`'s, and the start button's name is `syncResume.ts`'s.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Sync.
 */

import type { SyncPreviewSummary, SyncProgress, SyncRunRecord, SyncStage } from "../types";
import { pluralize } from "./pluralize";
import { formatDuration, formatTimeRemaining } from "./syncEstimate";
import type { SyncRunView } from "./syncRunView";

// ── Section headings ──

export const PREVIEW_HEADING = "Preview";
export const RUN_HEADING = "Sync running";
export const OPTIONS_HEADING = "Options";
export const MEMORY_HEADING = "Steam memory";
export const RUNS_HEADING = "Last runs";

// ── Nothing pending, nothing running ──

/**
 * The line over the start button. It quotes the button's name rather than
 * spelling one of its own, so it cannot name a button that is not on screen.
 */
export function idleLine(skipPreview: boolean, startLabel: string): string {
  return skipPreview
    ? `Nothing is waiting to be applied. Skip preview is on, so ${startLabel} applies changes without showing them first.`
    : "Nothing is waiting to be applied. Start a preview to see what would change.";
}

// ── The preview ──

/** The three answers to a preview. Apply and Refresh are also what the
 *  session-budget card names, so they are spelled here once. */
export const APPLY_SYNC_LABEL = "Apply Sync";
export const REFRESH_LABEL = "Refresh";
export const CANCEL_PREVIEW_LABEL = "Cancel";

export const FULL_RESYNC_LINE = "Full re-sync — all platforms re-fetched.";

/** Travels with the button row, above it: it explains the deadline's "expired"
 *  and names the button to press instead. */
export const PREVIEW_EXPIRED_LINE = "This preview is too old to apply. Refresh works out a fresh one.";

/** The preview table's column headings. */
export const PREVIEW_COLUMN_NAMES = ["Platform", "New", "Updated", "Removed"] as const;

/** What stands where the per-platform rows would, when the backend sent none. The
 *  totals row still stands: the summary is the authority and nothing adds up what
 *  it was not sent. */
export const MISSING_BREAKDOWN_LINE = "Your server did not send the per-platform split, so only the totals are shown.";

/** What a platform row says about a platform the run's platform list does not
 *  hold — its toggle went off, RomM stopped listing it, or the only route to it
 *  is an enabled collection. The wording has to fit all three, so it states what
 *  is known (the platform itself is not synced) rather than guessing the cause. */
export const NOT_SYNCED_NOTE = "not synced as a platform";

/** What a row whose subject is not games puts in the three game columns. The
 *  rows above the Total have to add up to it, and a collection count in one of
 *  those columns would not. */
export const NO_COUNT = "—";

export const COLLECTIONS_ROW_NAME = "Collections";
export const PLATFORM_COLLECTIONS_ROW_NAME = "Platform collections";
export const TOTAL_ROW_NAME = "Total";

/** Apply-time (seconds) at or above which the hint appends the sleep caveat.
 *  Below ~10 minutes a sync finishes fast enough that the note is noise. */
const LONG_SYNC_HINT_THRESHOLD_SEC = 600;

/** The line under a preview with something to apply; the sleep caveat is only
 *  worth its clause for a genuinely long run. */
export function previewHint(applySeconds: number): string {
  return (
    "Progress is saved about every 200 games — cancelling is safe." +
    (applySeconds >= LONG_SYNC_HINT_THRESHOLD_SEC ? " Long syncs pause during sleep; keep the Deck powered." : "")
  );
}

export const PAUSE_ADVISORY =
  "Will likely pause partway to protect Steam's memory — normal for large syncs. Restart Steam when prompted, then resume.";

/** The deadline clause on the preview's heading: its remaining life, or nothing
 *  at all when the backend sent no deadline (an older backend). */
export function previewDeadlineNote(expired: boolean, secondsLeft: number | null): string | null {
  if (expired) return "expired";
  if (secondsLeft === null) return null;
  return `expires in ${formatTimeRemaining(secondsLeft)}`;
}

/**
 * Informational scope line — "3 platforms · 2 collections" — the enabled
 * platforms and collections the run spans, shown independently of the diffs
 * (#29). Empty when both counts are 0 (an older backend that omits them), so the
 * caller shows the estimate alone rather than a misleading "0 platforms".
 */
export function formatSyncScope(s: SyncPreviewSummary): string {
  const parts: string[] = [];
  if ((s.sync_platform_count ?? 0) > 0) parts.push(pluralize(s.sync_platform_count ?? 0, "platform"));
  if ((s.sync_collection_count ?? 0) > 0) parts.push(pluralize(s.sync_collection_count ?? 0, "collection"));
  return parts.join(" · ");
}

/** The scope and the estimate, on one line. */
export function previewEstimateLine(s: SyncPreviewSummary, applySeconds: number): string {
  const scope = formatSyncScope(s);
  return `${scope ? `Syncing ${scope} · ` : ""}estimated duration ${formatDuration(applySeconds)}`;
}

/**
 * What a preview with no rows to draw says instead of a table of zeros.
 *
 * The three cases are three different facts and the reader acts on each
 * differently: cover work still has an Apply to press (#1386), an unstamped
 * platform needs a 0-delta apply to heal a lingering "interrupted" (#1416), and
 * a genuinely empty delta has nothing to do at all.
 *
 * *hasChanges* is `previewHasChanges` — the same condition that arms Apply Sync
 * — and it is what decides between the last sentence and the rest, rather than
 * this function asking the same question a second way. So "up to date" is said
 * only where the button is dead, and a leg of that condition with no wording of
 * its own here falls to the generic line instead.
 */
export function emptyPreviewSentence(s: SyncPreviewSummary, hasChanges: boolean): string {
  if (!hasChanges) return "Everything is up to date.";
  const covers = s.cover_refresh_count ?? 0;
  if (covers > 0) return `No shortcut changes — ${pluralize(covers, "cover update")}.`;
  if ((s.restamp_platform_count ?? 0) > 0) return "No changes — finishing a previous sync.";
  return "No shortcut changes — there is still something to apply.";
}

/** The second line of a row whose subject is not games: what was added and what
 *  was removed, with an empty side dropped. `null` when neither side has
 *  anything, which is also what says the row has nothing to draw. */
function addedRemovedLine(added: string | null, removed: string | null): string | null {
  const parts: string[] = [];
  if (added !== null) parts.push(`Added: ${added}`);
  if (removed !== null) parts.push(`Removed: ${removed}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The RomM collections the run would add to Steam and remove from it, by name.
 *  `null` when the diff names none. */
export function collectionNames(s: SyncPreviewSummary): string | null {
  const diff = s.collection_diff;
  if (!diff) return null;
  return addedRemovedLine(
    diff.added.length > 0 ? diff.added.join(", ") : null,
    diff.removed.length > 0 ? diff.removed.join(", ") : null,
  );
}

/** The Steam collections the sync keeps one of per platform, as the counts the
 *  backend sends for them — it sends no names. `null` where nothing changed on
 *  either side. */
export function platformCollectionCounts(s: SyncPreviewSummary): string | null {
  const diff = s.platform_collection_diff;
  if (!diff) return null;
  return addedRemovedLine(
    diff.added_count > 0 ? String(diff.added_count) : null,
    diff.removed_count > 0 ? String(diff.removed_count) : null,
  );
}

/**
 * What the Total cannot carry, said under it — the collection changes, which the
 * three game columns hold an em dash for.
 *
 * Without it a preview whose only change is a collection membership reads
 * "Total 0 0 0" under a live Apply Sync, and the reader is left to choose
 * between the number and the button. `null` where both diffs are quiet, which is
 * every preview whose whole story the columns already tell.
 */
export function collectionChangeLine(s: SyncPreviewSummary): string | null {
  const parts: string[] = [];
  const added = s.collection_diff?.added.length ?? 0;
  const removed = s.collection_diff?.removed.length ?? 0;
  if (added > 0) parts.push(`${pluralize(added, "collection")} added`);
  if (removed > 0) parts.push(`${pluralize(removed, "collection")} removed`);
  // The per-platform Steam collections come as counts and no names, so they are
  // stated as one changed count rather than split into added and removed —
  // which is also what the row above says about them.
  const platform = (s.platform_collection_diff?.added_count ?? 0) + (s.platform_collection_diff?.removed_count ?? 0);
  if (platform > 0) parts.push(`${pluralize(platform, "platform collection")} changed`);
  return parts.length > 0 ? `plus ${parts.join(", ")}` : null;
}

// ── The run ──

export const CANCEL_SYNC_LABEL = "Cancel Sync";
export const CANCELLING_LABEL = "Cancelling…";

/** The run table's column headings. */
export const RUN_COLUMN_NAMES = ["Unit", "Status", "Result"] as const;

/** What a unit row says beside a collection's name. */
export const COLLECTION_UNIT_NOTE = "collection";

/** Where a run has got, beside its heading — "unit 3 of 16 · about 2 min left" —
 *  or `null` with neither to say. */
export function runProgressNote(run: SyncRunView): string | null {
  const stepText = run.totalSteps > 0 ? `unit ${run.step} of ${run.totalSteps}` : "";
  const parts = [stepText, run.etaText ?? ""].filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * What stands where the unit list would, while the run has no plan to list. The
 * plan arrives once per run, so a store that started empty after a JS-context
 * rebuild stays empty for the rest of it; the frames still carry the fine-detail
 * line, so that is what is said, and the sentence is for the run that has neither.
 */
export function noUnitsLine(run: SyncRunView): string {
  return run.hasFineDetail ? run.fineDetailText : "Per-unit detail is not available for this run.";
}

/**
 * What the running row's status says, scoped to the UNIT rather than to the run.
 *
 * `stageLabel` on the shared run view names the run's phase ("Fetching library"),
 * which is the right caption over the whole-run bar and the wrong one in a row
 * that already names one platform. Same stages, said from one row's point of
 * view.
 */
const UNIT_STAGE_TEXT: Record<SyncStage, string> = {
  discovering: "starting",
  fetching: "fetching",
  applying: "applying shortcuts",
  finalizing: "finishing",
  done: "done",
  cancelled: "stopped",
  error: "stopped",
};

export function unitStageText(stage: SyncProgress["stage"]): string {
  return stage ? UNIT_STAGE_TEXT[stage] : "working";
}

export const UNIT_DONE = "done";
export const UNIT_WAITING = "waiting";

// ── Options ──

export const SKIP_PREVIEW_LABEL = "Skip preview";
export const SKIP_PREVIEW_DESCRIPTION = "Start the sync without asking first.";
export const FORCE_FULL_SYNC_LABEL = "Force Full Sync";

/** The confirm Force Full Sync is behind. */
export const FORCE_FULL_SYNC_CONFIRM = {
  title: "Force a full re-sync?",
  description:
    "This forgets what has already been synced, so the next run re-fetches every platform and rewrites every " +
    "shortcut. Your games stay in Steam — only the plugin's record of what is already correct is cleared, which is " +
    "also what a resume would have continued from.",
  confirm: FORCE_FULL_SYNC_LABEL,
  cancel: "Cancel",
} as const;

// ── Steam memory ──

export const MEMORY_NOW_LABEL = "Now";
export const MEMORY_LAST_RUN_LABEL = "Last run";
export const MEMORY_UNAVAILABLE = "unavailable";
export const MEMORY_NOT_RECORDED = "not recorded";

// ── Last runs ──

export const RUNS_READ_FAILED = "Could not read the run history. Open the page again to try.";
export const RUNS_READING = "Reading the run history…";
export const RUNS_NONE = "No sync has run yet.";

/**
 * When a run started, as the reader thinks of it. Today and yesterday are named
 * rather than dated, because a narrow row has no width for a date the reader can
 * work out from the word.
 *
 * Reads the clock, like `formatTimeAgo` does and for the same reason: the answer
 * is about now, and re-deriving it per render is what keeps it true across a
 * page that stays open.
 */
export function formatRunStart(iso: string): string {
  const started = new Date(iso);
  if (Number.isNaN(started.getTime())) return iso;
  const time = started.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(started, now)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(started, yesterday)) return `Yesterday ${time}`;
  return `${started.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

/**
 * What a run covered, in one line.
 *
 * A `null` completed list is a run that never recorded one, not a run that
 * synced nothing — so the planned counts are what can honestly be said about it,
 * and the status word beside the row is what says why the list is missing. An
 * empty list would read as a finished run that touched nothing.
 *
 * A run whose plan held no platform — a collections-only run, or one that
 * planned nothing — drops the platform clause on both branches rather than
 * reading "0 platforms" over a scope it never had. What is left to say then
 * differs by branch, and the two are different facts: a run with no recorded
 * list recorded nothing about its coverage, where a run with an empty one
 * recorded that it completed nothing.
 */
export function formatRunCoverage(run: SyncRunRecord): string {
  const platforms = run.platforms_completed;
  if (platforms === null) {
    return run.platforms_planned > 0 ? `${pluralize(run.platforms_planned, "platform")} planned` : "nothing recorded";
  }
  const parts: string[] = [];
  if (run.platforms_planned > 0 || platforms.length > 0) {
    parts.push(
      platforms.length === run.platforms_planned
        ? pluralize(platforms.length, "platform")
        : `${platforms.length} of ${run.platforms_planned} platforms`,
    );
  }
  const collections = run.collections_completed;
  if (collections !== null && collections.length > 0) parts.push(pluralize(collections.length, "collection"));
  return parts.length > 0 ? parts.join(" · ") : "nothing completed";
}

/** What a run covered, and the error it ended with where it ended with one. */
export function runHistorySubline(run: SyncRunRecord): string {
  return run.error === null ? formatRunCoverage(run) : `${formatRunCoverage(run)} · ${run.error}`;
}
