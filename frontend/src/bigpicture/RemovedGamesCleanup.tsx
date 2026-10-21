import { useCallback, useEffect, useRef, useState, FC } from "react";
import { showToast } from "../utils/toast";
import {
  ButtonItem,
  DialogButton,
  Field,
  Focusable,
  ModalRoot,
  PanelSection,
  PanelSectionRow,
  ProgressBar,
  ToggleField,
  showModal,
} from "@decky/ui";
import {
  getPrunePreview,
  startPrune,
  logError,
  logInfo,
  logWarn,
  type PrunePreviewItem,
  type PrunePreviewResult,
  type PruneScope,
} from "../api/backend";
import { detach } from "../utils/detach";
import {
  beginPrunePreview,
  beginPruneRun,
  getPruneState,
  isPruneResultLost,
  onPruneStateChange,
  type PruneComplete,
  type PruneProgress,
} from "../utils/pruneStore";
import { scrollNearestToTop } from "../utils/scrollHelpers";
import { getSyncProgress, onSyncProgressChange } from "../utils/syncProgress";
import { withTimeout } from "../utils/withTimeout";
import type { PageRead } from "../utils/useDataPage";
import {
  CANCEL_HINT,
  CANCELLING_HINT,
  RESULT_LOST_MESSAGE,
  completionDescription,
  confirmBlockedReason,
  omittedWarnings,
  plural,
  removedInGroup,
  scanButtonDescription,
  stageLabel,
} from "../utils/pruneWording";
import {
  finishedGroupsPercent,
  loadRemainingPages,
  requestFor,
  requestPruneCancel,
  stageInstalledSelections,
  PRUNE_ENDPOINT_TIMEOUT_MS,
} from "../utils/pruneReview";
import { CleanupList, formatBytes } from "./CleanupList";
import { countCleanup, planCleanup, versionsDeletingFiles, type CleanupCounts } from "./cleanupPlan";
import { ButtonRow, FLAT_BUTTON, MUTED, RED } from "./layout/pane";

export { STAGE_LABELS } from "../utils/pruneWording";
export { stageInstalledSelections } from "../utils/pruneReview";

/**
 * What makes the finished run's details region a focus stop.
 *
 * Everything inside it is plain text, and a region here scrolls only by focus
 * moving into it, so without a stop of its own everything past its 180 px is out
 * of reach with a controller. `focusableIfEmpty` rather than an activate handler:
 * it makes the node a stop only while the node holds no child nav node, so it
 * steps aside by itself the day a control is added in there, where a plain
 * `focusable` would keep the stop and swallow it — and an activate handler would
 * promise an action this region has not got. `FocusableProps` declares neither
 * option, so it arrives through a spread of this — the ESLint rule's paragraphs
 * under "Two widths" in `docs/architecture/qam-panel.md` state both halves.
 *
 * This diverges from the idiom its peers use: `SessionBudgetBanner` and the other
 * text-only notices became stops by carrying a no-op `onActivate`. The difference
 * is not style — that promotes the node to `focusable`, which keeps the stop and
 * swallows whatever control is added inside it later.
 *
 * The region asks for no `tabIndex` of its own: that attribute is Steam's to write
 * (`docs/architecture/qam-panel.md`), and where it writes none it means it, so a
 * hand-written one would override a deliberate omission.
 */
const DETAILS_REGION_STOP: { focusableIfEmpty: boolean } = { focusableIfEmpty: true };

/** Caption + bar for a running cleanup, shared by the dialog and Data Management's Gone from RomM pane. */
const CleanupProgress: FC<{ progress: PruneProgress }> = ({ progress }) => (
  <div style={{ width: "100%" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "12px" }}>
      <span style={{ overflowWrap: "anywhere" }}>
        {stageLabel(progress.stage)} — {progress.name}
      </span>
      <span style={{ flexShrink: 0, marginLeft: "8px" }}>
        {progress.current} / {progress.total}
      </span>
    </div>
    <ProgressBar
      indeterminate={progress.total <= 0}
      {...(progress.total > 0 ? { nProgress: finishedGroupsPercent(progress.current, progress.total) } : {})}
    />
  </div>
);

/**
 * The bar's last frame, rendered beside the run's summary.
 *
 * Full means the run is over, not that it succeeded — the summary next to it
 * says how it ended. Without it the running bar, which stops one group short of
 * full, would simply vanish when the terminal frame lands.
 */
const FinishedCleanupBar: FC = () => <ProgressBar nProgress={100} />;

/** What the Confirm button says: pressed, then the run's current stage, then how many versions it removes. */
function confirmButtonLabel(starting: boolean, progress: PruneProgress | null, versionsRemoved: number): string {
  if (starting) return "Starting...";
  if (progress) return `${stageLabel(progress.stage)}...`;
  return `Remove ${versionsRemoved} ${plural(versionsRemoved, "version", "versions")}`;
}

/** The summary's counts, in the order the dialog states them, each left out where it is zero. */
function countLabels(counts: CleanupCounts): string[] {
  const kept =
    counts.keptForShortcut > 0
      ? [
          `${counts.keptForShortcut} ${plural(counts.keptForShortcut, "version kept because a shortcut is on it", "versions kept because a shortcut is on them")}`,
        ]
      : [];
  if (counts.versionsRemoved === 0) return kept;
  return [
    `${counts.versionsRemoved} ${plural(counts.versionsRemoved, "version", "versions")} removed`,
    ...(counts.gamesRemovedWithShortcut > 0
      ? [
          `${counts.gamesRemovedWithShortcut} ${plural(counts.gamesRemovedWithShortcut, "game removed with its shortcut", "games removed with their shortcut")}`,
        ]
      : []),
    ...(counts.filesDeleted > 0
      ? [`${counts.filesDeleted} downloaded ${plural(counts.filesDeleted, "file", "files")} deleted`]
      : []),
    ...kept,
  ];
}

/** A run in flight: its caption and bar, and the Stop that ends it. */
const CleanupRunProgress: FC<{ progress: PruneProgress; cancelling: boolean; onStop: () => void }> = ({
  progress,
  cancelling,
  onStop,
}) => (
  <div style={{ marginTop: "10px", color: "#c7d5e0" }}>
    <div role="status" aria-live="polite">
      <CleanupProgress progress={progress} />
    </div>
    <div style={{ color: MUTED, fontSize: "12px", marginTop: "4px" }}>{CANCEL_HINT}</div>
    <ButtonRow padding="6px 0 0">
      <DialogButton style={FLAT_BUTTON} disabled={cancelling} onClick={onStop}>
        {cancelling ? "Stopping..." : "Stop Cleanup"}
      </DialogButton>
    </ButtonRow>
    {cancelling && (
      <div role="status" aria-live="polite" style={{ color: MUTED, fontSize: "12px", marginTop: "4px" }}>
        {CANCELLING_HINT}
      </div>
    )}
  </div>
);

/** A finished run: the full bar, the counts, and the groups worth a second look. */
const CleanupResult: FC<{ complete: PruneComplete }> = ({ complete }) => (
  <div style={{ marginTop: "10px", color: complete.success ? "#8fd18b" : "#ffcc66" }}>
    <FinishedCleanupBar />
    <div role="status" aria-live="polite">
      {complete.removed_count ?? complete.removed_rom_ids.length} removed;{" "}
      {complete.problem_count ??
        complete.results.filter((item) => ["partial", "failed", "skipped"].includes(item.status)).length}{" "}
      skipped, partial, or failed.
    </div>
    <Focusable
      role="region"
      aria-label="Cleanup details"
      {...DETAILS_REGION_STOP}
      style={{ maxHeight: "180px", overflowY: "auto", marginTop: "6px" }}
    >
      {complete.message && (
        <div style={{ fontSize: "12px", marginTop: "4px" }}>
          {complete.reason ? `${complete.reason}: ` : ""}
          {complete.message}
        </div>
      )}
      {complete.results
        .filter(
          (item) =>
            ["partial", "failed", "skipped"].includes(item.status) ||
            (item.warnings?.length ?? 0) > 0 ||
            item.warnings_omitted ||
            // A sealed bundle that removed nothing leaves a folder on
            // disk; saying so is what stops it being a mystery later.
            (item.bundle_path !== undefined && removedInGroup(item) === 0),
        )
        .map((item) => (
          <div key={item.group_id} style={{ fontSize: "12px", marginTop: "4px" }}>
            {item.name || item.group_id}: {item.message}
            {item.bundle_path !== undefined && removedInGroup(item) === 0 && (
              <div>Backup created, nothing removed. The folder stays at {item.bundle_path}.</div>
            )}
            {item.warnings?.map((warning) => (
              <div key={warning}>Warning: {warning}</div>
            ))}
            {omittedWarnings(item) > 0 && <div>{omittedWarnings(item)} additional warning(s) omitted.</div>}
          </div>
        ))}
    </Focusable>
  </div>
);

interface CleanupModalProps {
  initial: PrunePreviewResult;
  scope: PruneScope;
  romId: number | null;
  closeModal?: () => void;
}

const CleanupModal: FC<CleanupModalProps> = ({ initial, scope, romId, closeModal }) => {
  const [items, setItems] = useState<PrunePreviewItem[]>(initial.items ?? []);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);
  // Moved on by every page loop that starts and by the loading effect's cleanup,
  // so a page that answers for a loop no longer current writes nothing.
  const pageLoadGeneration = useRef(0);
  // The refusal a Confirm press got because the list was still loading or had
  // stopped, which stops being true once a page fails, Retry is pressed or the
  // list has all arrived.
  const listRefusal = useRef<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelRequestedFor, setCancelRequestedFor] = useState<string | null>(null);
  const [runStarted, setRunStarted] = useState(false);
  const [status, setStatus] = useState("");
  const clearListRefusal = useCallback(
    () => setStatus((current) => (current === listRefusal.current ? "" : current)),
    [],
  );
  const [removeRows, setRemoveRows] = useState(true);
  const [removeDeadGames, setRemoveDeadGames] = useState(true);
  const [recovery, setRecovery] = useState(true);
  const [confirmWithoutRecovery, setConfirmWithoutRecovery] = useState(false);
  const [includedContent, setIncludedContent] = useState<Set<number>>(new Set());
  const [freeBytes, setFreeBytes] = useState(initial.free_bytes ?? 0);
  const [pruneState, setPruneState] = useState(getPruneState());
  const [resultLost, setResultLost] = useState(isPruneResultLost());

  useEffect(() => {
    const unsubscribe = onPruneStateChange(() => {
      setPruneState(getPruneState());
      setResultLost(isPruneResultLost());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const total = initial.total ?? items.length;
  // The summary counts the rows offered for removal. `total` also counts the
  // other versions listed beside them, and leading with that number reads as a
  // threat to versions RomM still serves.
  const candidateTotal = initial.candidate_total ?? total;
  const games = planCleanup(items, { removeRows, removeDeadGames });
  const fileVersions = versionsDeletingFiles(games);
  // A switch stays where the reader left it while an option takes its row out of
  // the run, but only a file the run deletes is backed up or counted.
  const backedUp = new Set(
    recovery
      ? fileVersions.filter((version) => includedContent.has(version.item.rom_id)).map((version) => version.item.rom_id)
      : [],
  );
  const counts = countCleanup(games, (id) => backedUp.has(id));
  const selectedBytes = fileVersions.reduce(
    (sum, version) => sum + (backedUp.has(version.item.rom_id) ? (version.item.installed_bytes ?? 0) : 0),
    0,
  );
  const deletedBytes = fileVersions.reduce((sum, version) => sum + (version.item.installed_bytes ?? 0), 0);
  const unknownSelectedSize = fileVersions.some(
    (version) => backedUp.has(version.item.rom_id) && version.item.installed_bytes === null,
  );
  const insufficientSpace = recovery && (unknownSelectedSize || selectedBytes > freeBytes);
  const destructiveConfirmed = recovery || confirmWithoutRecovery;
  const allEntriesLoaded = items.length === total;
  const progress = pruneState.progress;
  const complete = pruneState.complete;
  const runInFlight = complete === null && (starting || pruneState.runId !== null);
  // Derived from the RUN's lifecycle, never the cancel endpoint call's: the call
  // resolving means the request was received, not that the run has stopped.
  // Tying the lock to it let seven presses through in three seconds (#1570 F19).
  // The exits are the terminal frame (complete), the run going away in the
  // store, and an outright refusal — the backend's idempotency is the safety
  // net behind that, not the mechanism.
  const cancelling = complete === null && cancelRequestedFor !== null && cancelRequestedFor === pruneState.runId;
  const blockedReason = confirmBlockedReason({
    completed: complete !== null,
    runInFlight,
    allEntriesLoaded,
    loaded: items.length,
    total,
    pageLoadFailed: pageLoadError !== null,
    destructiveConfirmed,
    insufficientSpace,
    unknownSelectedSize,
    anyOptionChosen: removeRows || removeDeadGames,
  });
  // Disabled ONLY where a press is unsafe or meaningless: a run is already
  // going, this dialog is showing a finished one, or the run would remove
  // nothing, which the summary says. Every other reason to refuse is explained
  // when pressed — a greyed button whose explanation the user has to hunt for is
  // the shape the silent no-op took.
  const pressBlocked = complete !== null || runInFlight || counts.versionsRemoved === 0;

  const toggleContent = (romIdToToggle: number, checked: boolean): void => {
    setIncludedContent((current) => {
      const next = new Set(current);
      if (checked) next.add(romIdToToggle);
      else next.delete(romIdToToggle);
      return next;
    });
  };

  const startPageLoad = useCallback(
    (from: number): void => {
      if (!initial.preview_id) return;
      const generation = ++pageLoadGeneration.current;
      detach(
        loadRemainingPages({ scope, romId, previewId: initial.preview_id, total: initial.total ?? 0 }, from, {
          isCurrent: () => generation === pageLoadGeneration.current,
          addRows: (rows, pageFreeBytes) => {
            setItems((current) => [...current, ...rows]);
            if (pageFreeBytes !== undefined) setFreeBytes(pageFreeBytes);
          },
          fail: (message, loaded) => {
            setPageLoadError(message);
            clearListRefusal();
            logWarn(`[prune] Preview page at offset ${loaded} of ${initial.total ?? 0} failed: ${message}`);
          },
          allArrived: clearListRefusal,
        }),
      );
    },
    [initial.preview_id, initial.total, scope, romId, clearListRefusal],
  );

  useEffect(() => {
    const generations = pageLoadGeneration;
    startPageLoad(initial.items?.length ?? 0);
    return () => {
      generations.current++;
    };
  }, [startPageLoad, initial.items]);

  const retryPageLoad = (): void => {
    setPageLoadError(null);
    clearListRefusal();
    startPageLoad(items.length);
  };

  const refreshFreeSpace = async (): Promise<void> => {
    if (!initial.preview_id) return;
    try {
      const refreshed = await withTimeout(
        getPrunePreview({
          scope,
          rom_id: romId,
          preview_id: initial.preview_id,
          offset: 0,
          limit: 0,
        }),
        PRUNE_ENDPOINT_TIMEOUT_MS,
      );
      if (!refreshed.success || typeof refreshed.free_bytes !== "number") {
        setStatus(refreshed.message ?? "Could not refresh recovery space.");
        return;
      }
      setFreeBytes(refreshed.free_bytes);
    } catch (e) {
      setStatus(`Could not refresh recovery space: ${e}`);
    }
  };

  const refuseLocally = (reason: { text: string; aboutList: boolean }): void => {
    const refusal = `Cleanup did not start: ${reason.text}`;
    listRefusal.current = reason.aboutList ? refusal : null;
    setStatus(refusal);
    logWarn(`[prune] Confirm refused locally: ${reason.text}`);
  };

  const start = async (): Promise<void> => {
    // Confirm is the destructive commit point, so every press is logged and
    // every outcome is visible in the dialog. A press that returns silently is
    // indistinguishable on device from a backend that has stopped responding.
    logInfo(`[prune] Confirm pressed (preview=${initial.preview_id ?? "none"}, scope=${scope}, total=${total})`);
    if (!initial.preview_id) {
      setStatus("This cleanup preview has no id — close and scan again.");
      logError("[prune] Confirm aborted: the modal holds no preview id");
      return;
    }
    if (blockedReason !== null) {
      refuseLocally(blockedReason);
      return;
    }
    setStarting(true);
    setStatus(backedUp.size ? `Staging ${backedUp.size} installed-content selection(s)...` : "Starting cleanup...");
    try {
      const staged = await stageInstalledSelections(initial.preview_id, [...backedUp], setStatus);
      if (!staged.ok) return;
      const result = await withTimeout(
        startPrune({
          preview_id: initial.preview_id,
          confirmed: true,
          remove_rows: removeRows,
          remove_fully_vanished: removeDeadGames,
          create_recovery_bundle: recovery,
          installed_selection_id: staged.selectionId,
        }),
        PRUNE_ENDPOINT_TIMEOUT_MS,
      );
      if (!result.success) {
        setStatus(result.message ?? "Cleanup could not start.");
        logWarn(`[prune] startPrune refused: reason=${result.reason ?? "none"} message=${result.message ?? "none"}`);
        return;
      }
      if (!result.run_id) {
        // A success without a run id can never be adopted by id — say so instead
        // of wedging frame admission on a run the store will never recognise.
        setStatus("Cleanup started but the backend response carried no run id.");
        logError("[prune] startPrune reported success with no run id");
        return;
      }
      setRunStarted(true);
      if (!beginPruneRun(result.run_id, initial.preview_id)) {
        // The run IS executing; this dialog just can't receive its frames, and
        // neither can Data Management. Saying "running..." here would leave the
        // user watching a progress line that can never arrive.
        setStatus("Cleanup started, but this dialog lost track of it. Check the log, then re-scan to see the result.");
        logError(`[prune] run ${result.run_id} started but preview ${initial.preview_id} was no longer pending`);
        return;
      }
      setStatus("Cleanup running...");
      logInfo(`[prune] startPrune accepted: run=${result.run_id}`);
    } catch (e) {
      const adopted = getPruneState();
      if (adopted.runId !== null) {
        setRunStarted(true);
        setStatus(adopted.complete ? "Cleanup completed." : "Cleanup running...");
        logWarn(`[prune] startPrune response was lost; adopted run ${adopted.runId} from its frames instead: ${e}`);
      } else {
        setStatus(`Cleanup could not start: ${e}`);
        logError(`[prune] startPrune threw with no run adopted: ${e}`);
      }
    } finally {
      setStarting(false);
    }
  };

  const stop = async (runId: string): Promise<void> => {
    setCancelRequestedFor(runId);
    const failure = await requestPruneCancel(runId);
    if (failure !== null) {
      // Refused means this run is not running, so no terminal
      // frame is coming to re-open the control — do it here.
      setCancelRequestedFor(null);
      setStatus(failure);
    }
  };

  const backUpEveryFile = (checked: boolean): void => {
    setIncludedContent((current) => {
      const next = new Set(current);
      for (const version of fileVersions) {
        if (checked) next.add(version.item.rom_id);
        else next.delete(version.item.rom_id);
      }
      return next;
    });
  };

  const changeRecovery = (checked: boolean): void => {
    setRecovery(checked);
    if (checked) setConfirmWithoutRecovery(false);
    else setIncludedContent(new Set());
  };

  // Only claimed once every page is here: an unseen page could still hold a file the run deletes.
  const nothingToBackUp = allEntriesLoaded && fileVersions.length === 0;
  const everyFileBackedUp =
    fileVersions.length > 0 && fileVersions.every((version) => backedUp.has(version.item.rom_id));
  const summaryCounts = countLabels(counts);

  return (
    <ModalRoot closeModal={closeModal}>
      {/* The whole dialog scrolls as one. A separate inner scroller for the table
          gives the controller two scroll axes to choose between on every focus
          move. */}
      <div
        style={{
          minWidth: "440px",
          maxWidth: "720px",
          padding: "18px",
          paddingBottom: "28px",
          maxHeight: "76vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "6px" }}>Clean Up Removed RomM Games</div>
        <div data-testid="cleanup-summary" style={{ color: "#c7d5e0", marginBottom: "14px" }}>
          <div>
            {`RomM no longer has ${candidateTotal} ${plural(candidateTotal, "version", "versions")} this device still holds.`}{" "}
            Each one is checked against RomM again before anything is removed.{" "}
            {counts.versionsRemoved === 0 ? "If you clean up now: nothing is removed." : "If you clean up now:"}
          </div>
          {summaryCounts.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
              {summaryCounts.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
        </div>

        <Focusable flow-children="vertical">
          {/* Focusing the first control has to bring the intro above it back into
              view — Steam's focus engine only scrolls far enough to reveal the
              control itself, which strands the text off the top on a controller. */}
          <div onFocus={scrollNearestToTop}>
            <ToggleField
              label="Remove gone versions"
              description="Of games that still have another version on RomM."
              checked={removeRows}
              disabled={runInFlight}
              onChange={setRemoveRows}
            />
          </div>
          <ToggleField
            label="Remove games that are gone entirely"
            description="With its Steam shortcut where it has one, when RomM has no version of it left."
            checked={removeDeadGames}
            disabled={runInFlight}
            onChange={setRemoveDeadGames}
          />
          <ToggleField
            label="Back up before removing"
            description={`Saves, playtime and the shortcut’s Steam details, under ${initial.recovery_root ?? "the recovery directory"}.`}
            checked={recovery}
            disabled={runInFlight}
            onChange={changeRecovery}
          />
          {!recovery && (
            <ToggleField
              label="I understand there is no recovery bundle"
              description="Local database state and playtime will have no recovery bundle."
              checked={confirmWithoutRecovery}
              disabled={runInFlight}
              onChange={setConfirmWithoutRecovery}
            />
          )}
          <ToggleField
            label="Back up downloaded game files too"
            description={
              nothingToBackUp
                ? "No downloaded file would be deleted, so there is nothing to back up."
                : `Selected: ${formatBytes(selectedBytes)} of ${formatBytes(deletedBytes)} · ${formatBytes(freeBytes)} free`
            }
            checked={everyFileBackedUp}
            disabled={runInFlight || !recovery || fileVersions.length === 0}
            onChange={backUpEveryFile}
          />
          <div data-testid="cleanup-space" style={{ padding: "0 0 4px" }}>
            <div style={{ color: MUTED, fontSize: "12px" }}>
              A lower bound: the backend remeasures saves, histories, caches and Steam files before anything changes.
              Large selections are staged in bounded pages first; every checked item stays part of this run.
            </div>
            {insufficientSpace && (
              <div style={{ color: "#ff8c6a", marginTop: "4px" }}>
                {unknownSelectedSize
                  ? "A selected installed ROM has no safe measurable size."
                  : "Not enough free space."}
              </div>
            )}
            <ButtonRow padding="6px 0 0">
              <DialogButton style={FLAT_BUTTON} disabled={runInFlight} onClick={() => detach(refreshFreeSpace())}>
                Refresh free space
              </DialogButton>
            </ButtonRow>
          </div>
        </Focusable>

        {/* The run's controls sit ABOVE the list rather than after it: focus
            follows element order, so a bar after the rows is one press per row
            away however it is drawn. */}
        <div data-testid="cleanup-bar" style={{ marginTop: "14px", padding: "10px", background: "rgba(0,0,0,0.20)" }}>
          <ButtonRow padding="0">
            {pageLoadError !== null && (
              <DialogButton style={FLAT_BUTTON} onClick={retryPageLoad}>
                Retry loading
              </DialogButton>
            )}
            <DialogButton style={FLAT_BUTTON} disabled={starting && complete === null} onClick={() => closeModal?.()}>
              {runStarted || complete !== null ? "Close" : "Cancel"}
            </DialogButton>
            <DialogButton style={FLAT_BUTTON} disabled={pressBlocked} onClick={() => detach(start())}>
              <span style={{ color: RED }}>{confirmButtonLabel(starting, progress, counts.versionsRemoved)}</span>
            </DialogButton>
          </ButtonRow>
          {pageLoadError !== null && (
            <div role="status" aria-live="polite" style={{ color: "#ff8c6a", fontSize: "12px", marginTop: "8px" }}>
              {pageLoadError}
            </div>
          )}
          {progress && (
            <CleanupRunProgress
              progress={progress}
              cancelling={cancelling}
              onStop={() => detach(stop(progress.run_id))}
            />
          )}
          {complete && <CleanupResult complete={complete} />}
          {resultLost && (
            <div role="status" aria-live="polite" style={{ marginTop: "10px", color: "#ff8c6a" }}>
              {RESULT_LOST_MESSAGE}
            </div>
          )}
          {status && !complete && (
            <div role="status" aria-live="polite" style={{ marginTop: "10px", color: "#ffcc66" }}>
              {status}
            </div>
          )}
          {blockedReason !== null && !runInFlight && (
            <div style={{ marginTop: "10px", color: "#ff8c6a", fontSize: "12px" }}>{blockedReason.text}</div>
          )}
        </div>

        <CleanupList
          games={games}
          backup={{ recovery, runInFlight, isBackedUp: (id) => backedUp.has(id), onBackUp: toggleContent }}
        />
      </div>
    </ModalRoot>
  );
};

/**
 * Scan for removed RomM games and open the review over what it found.
 *
 * Answers whether there was anything to review. *onScanRead* is told where the
 * scan stands at every step — reading as it starts, then the count either way,
 * including zero, or failed — so a caller showing that number never has to
 * infer a state from silence.
 */
export async function openRemovedGamesCleanupModal(
  romId?: number,
  onScanRead?: (read: PageRead<number>) => void,
): Promise<boolean> {
  const scope: PruneScope = romId === undefined ? "bulk" : "rom";
  onScanRead?.({ state: "reading" });
  let result: PrunePreviewResult;
  try {
    result = await withTimeout(getPrunePreview(requestFor(scope, romId ?? null, null, 0)), PRUNE_ENDPOINT_TIMEOUT_MS);
  } catch (e) {
    onScanRead?.({ state: "failed" });
    throw e;
  }
  if (!result.success) {
    onScanRead?.({ state: "failed" });
    throw new Error(result.message ?? "Cleanup scan failed.");
  }
  onScanRead?.({ state: "answered", value: result.total ?? 0 });
  if ((result.total ?? 0) === 0) return false;
  // Without a preview id nothing can admit this run's frames — surface the
  // malformed response rather than opening a modal that can never report.
  if (!result.preview_id) throw new Error("Cleanup scan response carried no preview id.");
  beginPrunePreview(result.preview_id);
  showModal(<CleanupModal initial={result} scope={scope} romId={romId ?? null} />);
  return true;
}

export const RemovedGamesCleanupSection: FC<{ onScanRead?: (read: PageRead<number>) => void }> = ({ onScanRead }) => {
  const [scanning, setScanning] = useState(false);
  const [cancelRequestedFor, setCancelRequestedFor] = useState<string | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [syncRunning, setSyncRunning] = useState(getSyncProgress().running);
  const [pruneState, setPruneState] = useState(getPruneState());
  const [resultLost, setResultLost] = useState(isPruneResultLost());
  const lastRunIdRef = useRef(getPruneState().runId);

  useEffect(() => {
    const unsubscribeSync = onSyncProgressChange(() => setSyncRunning(getSyncProgress().running));
    const unsubscribePrune = onPruneStateChange(() => {
      const next = getPruneState();
      // A refusal message belongs to the run it was refused for; carrying it
      // into the next run would describe that run's Stop button with an
      // outcome that never happened to it. Tracked in a ref because this
      // subscription is registered once and would otherwise compare against
      // the state it closed over on mount.
      if (next.runId !== lastRunIdRef.current) {
        lastRunIdRef.current = next.runId;
        setCancelStatus(null);
      }
      setPruneState(next);
      setResultLost(isPruneResultLost());
    });
    return () => {
      unsubscribeSync();
      unsubscribePrune();
    };
  }, []);

  const scan = async (): Promise<void> => {
    setScanning(true);
    try {
      if (!(await openRemovedGamesCleanupModal(undefined, onScanRead))) {
        showToast("No removed RomM entries were found.");
      }
    } catch (e) {
      logError(`Removed-game cleanup scan failed: ${e}`);
      showToast("Could not scan removed RomM games.", { subtext: `${e}` });
    } finally {
      setScanning(false);
    }
  };

  const progress = pruneState.progress;
  const complete = pruneState.complete;
  // A run that has started but not yet emitted its first progress frame is
  // still a run: gate on the run id, not just on progress, or the entry point
  // stays live during exactly the window where a second scan would collide.
  const runActive = complete === null && pruneState.runId !== null;
  const cancelling = runActive && cancelRequestedFor !== null && cancelRequestedFor === pruneState.runId;
  return (
    <PanelSection title="Removed RomM Games">
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={scanning || syncRunning || runActive || progress !== null}
          description={scanButtonDescription(syncRunning, runActive)}
          onClick={() => detach(scan())}
        >
          {scanning ? "Scanning…" : "Clean Up Removed RomM Games"}
        </ButtonItem>
      </PanelSectionRow>
      {resultLost && (
        <PanelSectionRow>
          <Field label={RESULT_LOST_MESSAGE} />
        </PanelSectionRow>
      )}
      {runActive && (
        <>
          <PanelSectionRow>
            {progress ? (
              <CleanupProgress progress={progress} />
            ) : (
              <Field label="Cleanup starting..." description={CANCEL_HINT} />
            )}
          </PanelSectionRow>
          {progress?.bundle_path && (
            <PanelSectionRow>
              <Field label={`Recovery sealed: ${progress.bundle_path}`} />
            </PanelSectionRow>
          )}
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={cancelling}
              description={cancelStatus ?? (cancelling ? CANCELLING_HINT : undefined)}
              onClick={() =>
                detach(
                  (async () => {
                    const runId = pruneState.runId!;
                    setCancelRequestedFor(runId);
                    const failure = await requestPruneCancel(runId);
                    setCancelStatus(failure);
                    // A refusal is the only outcome with no terminal frame
                    // behind it, so it is the only one that re-opens the button.
                    if (failure !== null) setCancelRequestedFor(null);
                  })(),
                )
              }
            >
              {cancelling ? "Stopping..." : "Stop Cleanup"}
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}
      {complete && (
        <>
          <PanelSectionRow>
            <FinishedCleanupBar />
          </PanelSectionRow>
          <PanelSectionRow>
            <Field
              label={`${complete.removed_count ?? complete.removed_rom_ids.length} removed; ${complete.problem_count ?? complete.results.filter((item) => ["partial", "failed", "skipped"].includes(item.status)).length} skipped, partial, or failed`}
              description={completionDescription(complete)}
            />
          </PanelSectionRow>
        </>
      )}
    </PanelSection>
  );
};
