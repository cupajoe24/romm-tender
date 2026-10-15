import {
  cancelPrune,
  getPrunePreview,
  stagePruneInstalledSelection,
  logError,
  logInfo,
  logWarn,
  type PrunePreviewItem,
  type PrunePreviewRequest,
  type PrunePreviewResult,
  type PruneScope,
} from "../api/backend";
import { withTimeout } from "./withTimeout";

export const PAGE_SIZE = 50;
export const SELECTION_PAGE_SIZE = 100;
export const PRUNE_ENDPOINT_TIMEOUT_MS = 15000;

/**
 * How full the bar is: the groups already behind the run, not the one in it.
 *
 * `current` names the group being worked on, so it is finished only once a later
 * frame moves past it. Counting it as done filled a one-group run before its
 * first byte moved, and a group publishes nothing during its longest phase — a
 * multi-hundred-megabyte content backup — so the bar sat at full for the whole
 * of it. Clamped: a frame that arrives late or out of order must not push the
 * fill past either end.
 */
export function finishedGroupsPercent(current: number, total: number): number {
  return Math.min(100, Math.max(0, ((current - 1) / total) * 100));
}

export function requestFor(
  scope: PruneScope,
  romId: number | null,
  previewId: string | null,
  offset: number,
  limit: number = PAGE_SIZE,
): PrunePreviewRequest {
  return { scope, rom_id: romId, preview_id: previewId, offset, limit };
}

/** Where loadRemainingPages puts what it fetched, and whether it still may. */
export interface PageLoadSink {
  isCurrent: () => boolean;
  addRows: (rows: PrunePreviewItem[], freeBytes: number | undefined) => void;
  fail: (message: string, loaded: number) => void;
  allArrived: () => void;
}

/**
 * Fetch a preview's pages after its first `from` rows, one after another, until
 * the whole list is here. A page that fails stops the loop and stays stopped —
 * Confirm keeps refusing and Retry resumes from the rows already loaded — rather
 * than retrying by itself against a backend that may keep failing.
 */
export async function loadRemainingPages(
  preview: { scope: PruneScope; romId: number | null; previewId: string; total: number },
  from: number,
  sink: PageLoadSink,
): Promise<void> {
  let loaded = from;
  const fail = (message: string): void => {
    if (sink.isCurrent()) sink.fail(message, loaded);
  };
  while (loaded < preview.total) {
    let page: PrunePreviewResult;
    try {
      page = await withTimeout(
        getPrunePreview(requestFor(preview.scope, preview.romId, preview.previewId, loaded)),
        PRUNE_ENDPOINT_TIMEOUT_MS,
      );
    } catch (e) {
      fail(`Could not load the rest of the list: ${e}`);
      return;
    }
    if (!sink.isCurrent()) return;
    if (!page.success) {
      fail(page.message ?? "Could not load the rest of the list.");
      return;
    }
    const rows = page.items ?? [];
    // The list cannot shrink under a preview, so an empty page short of the
    // total would otherwise ask for the same offset forever.
    if (rows.length === 0) {
      fail("The list ended before every entry arrived.");
      return;
    }
    loaded += rows.length;
    sink.addRows(rows, typeof page.free_bytes === "number" ? page.free_bytes : undefined);
  }
  if (sink.isCurrent()) sink.allArrived();
}

/**
 * Stage the installed-content opt-ins page by page, chaining each page onto the
 * selection the previous one opened. A refused page reports itself and stops the
 * whole Confirm — a partially staged selection must never reach the run.
 */
export async function stageInstalledSelections(
  previewId: string,
  selected: number[],
  setStatus: (message: string) => void,
): Promise<{ ok: true; selectionId: string | null } | { ok: false }> {
  let selectionId: string | null = null;
  for (let offset = 0; offset < selected.length; offset += SELECTION_PAGE_SIZE) {
    const page = selected.slice(offset, offset + SELECTION_PAGE_SIZE);
    const staged: {
      success: boolean;
      selection_id?: string;
      message?: string;
    } = await withTimeout(
      stagePruneInstalledSelection({
        preview_id: previewId,
        selection_id: selectionId,
        rom_ids: page,
        final: offset + page.length >= selected.length,
      }),
      PRUNE_ENDPOINT_TIMEOUT_MS,
    );
    if (!staged.success || !staged.selection_id) {
      setStatus(staged.message ?? "Installed-content selections could not be staged.");
      logWarn(`[prune] Confirm aborted while staging installed content: ${staged.message ?? "no message"}`);
      return { ok: false };
    }
    selectionId = staged.selection_id;
  }
  return { ok: true, selectionId };
}

/**
 * Ask the backend to stop `runId`. Returns the message to surface, or null when
 * the request was accepted — the run's own terminal frame reports the outcome,
 * so a success here must not overwrite it with chatter.
 */
export async function requestPruneCancel(runId: string): Promise<string | null> {
  logInfo(`[prune] Cancel pressed for run ${runId}`);
  try {
    const result = await withTimeout(cancelPrune(runId), PRUNE_ENDPOINT_TIMEOUT_MS);
    if (!result.success) {
      logWarn(`[prune] cancelPrune refused: reason=${result.reason ?? "none"}`);
      return result.message;
    }
    logInfo(`[prune] cancelPrune accepted for run ${runId}`);
    return null;
  } catch (e) {
    logError(`[prune] cancelPrune threw for run ${runId}: ${e}`);
    return `Could not request cancellation: ${e}`;
  }
}
