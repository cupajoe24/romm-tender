/**
 * Detail pane for Removed RomM Games in Desktop Data Management.
 * Implements the removed-game cleanup review as an inline pane inside the tab (Decision D8).
 */

import { useCallback, useEffect, useRef, useState, type FC, Fragment } from "react";
import { DialogButton, ProgressBar, Toggle } from "@decky/ui";
import {
  getPrunePreview,
  startPrune,
  logError,
  logWarn,
  type PrunePreviewItem,
  type PrunePreviewResult,
  type PruneScope,
} from "../../../api/backend";
import { detach } from "../../../utils/detach";
import {
  beginPrunePreview,
  beginPruneRun,
  getPruneState,
  isPruneResultLost,
  onPruneStateChange,
} from "../../../utils/pruneStore";
import { getSyncProgress, onSyncProgressChange } from "../../../utils/syncProgress";
import { withTimeout } from "../../../utils/withTimeout";
import {
  CANCEL_HINT,
  CANCELLING_HINT,
  RESULT_LOST_MESSAGE,
  completionDescription,
  confirmBlockedReason,
  confirmButtonLabel,
  formatBytes,
  omittedWarnings,
  plural,
  removedInGroup,
  scanButtonDescription,
  stageLabel,
  verdictFor,
  versionLine,
} from "../../../utils/pruneWording";
import {
  finishedGroupsPercent,
  loadRemainingPages,
  requestFor,
  requestPruneCancel,
  stageInstalledSelections,
  PRUNE_ENDPOINT_TIMEOUT_MS,
} from "../../../utils/pruneReview";
import type { DataPageState } from "../../../utils/useDataPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { SettingsToggle } from "../SettingsToggle";
import {
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  GREEN,
  MUTED,
  MUTED_TEXT_STYLE,
  NUMERIC_STYLE,
  RED,
  SECTION_STYLE,
  SUBLINE_STYLE,
  TABLE_STYLE,
  TD_STYLE,
  TEXT,
  TH_STYLE,
} from "../settingsStyles";

export interface RemovedGamesDetailPaneProps {
  state: DataPageState;
  ask: AskDialog;
}

export const RemovedGamesDetailPane: FC<RemovedGamesDetailPaneProps> = ({ state, ask }) => {
  const [reviewPreview, setReviewPreview] = useState<PrunePreviewResult | null>(null);
  const [items, setItems] = useState<PrunePreviewItem[]>([]);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);
  const pageLoadGeneration = useRef(0);
  const listRefusal = useRef<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelRequestedFor, setCancelRequestedFor] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState(false);

  const [removeRows, setRemoveRows] = useState(true);
  const [removeDeadGames, setRemoveDeadGames] = useState(true);
  const [recovery, setRecovery] = useState(true);
  const [confirmWithoutRecovery, setConfirmWithoutRecovery] = useState(false);
  const [includedContent, setIncludedContent] = useState<Set<number>>(new Set());
  const [freeBytes, setFreeBytes] = useState(0);

  const [pruneState, setPruneState] = useState(getPruneState());
  const [resultLost, setResultLost] = useState(isPruneResultLost());
  const [syncRunning, setSyncRunning] = useState(getSyncProgress().running);

  const clearListRefusal = useCallback(
    () => setStatus((current) => (current === listRefusal.current ? "" : current)),
    [],
  );

  useEffect(() => {
    const unsubscribeSync = onSyncProgressChange(() => setSyncRunning(getSyncProgress().running));
    const unsubscribePrune = onPruneStateChange(() => {
      setPruneState(getPruneState());
      setResultLost(isPruneResultLost());
    });
    return () => {
      unsubscribeSync();
      unsubscribePrune();
    };
  }, []);

  const total = reviewPreview?.total ?? items.length;
  const candidateTotal = reviewPreview?.candidate_total ?? total;
  const visibleItems = removeDeadGames ? items : items.filter((item) => item.candidate);
  const selectedBytes = visibleItems.reduce(
    (sum, item) => sum + (includedContent.has(item.rom_id) ? (item.installed_bytes ?? 0) : 0),
    0,
  );
  const unknownSelectedSize = visibleItems.some(
    (item) => includedContent.has(item.rom_id) && item.installed && item.installed_bytes === null,
  );
  const insufficientSpace = recovery && (unknownSelectedSize || selectedBytes > freeBytes);
  const destructiveConfirmed = recovery || confirmWithoutRecovery;
  const allEntriesLoaded = items.length === total;
  const progress = pruneState.progress;
  const complete = pruneState.complete;
  const runInFlight = complete === null && (starting || pruneState.runId !== null);
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

  const pressBlocked = complete !== null || runInFlight;

  const toggleContent = (romIdToToggle: number, checked: boolean): void => {
    setIncludedContent((current) => {
      const next = new Set(current);
      if (checked) next.add(romIdToToggle);
      else next.delete(romIdToToggle);
      return next;
    });
  };

  const startPageLoad = useCallback(
    (from: number, previewId: string, previewTotal: number): void => {
      const generation = ++pageLoadGeneration.current;
      detach(
        loadRemainingPages({ scope: "bulk", romId: null, previewId, total: previewTotal }, from, {
          isCurrent: () => generation === pageLoadGeneration.current,
          addRows: (rows, pageFreeBytes) => {
            setItems((current) => [...current, ...rows]);
            if (pageFreeBytes !== undefined) setFreeBytes(pageFreeBytes);
          },
          fail: (message, loaded) => {
            setPageLoadError(message);
            clearListRefusal();
            logWarn(`[prune] Preview page at offset ${loaded} of ${previewTotal} failed: ${message}`);
          },
          allArrived: clearListRefusal,
        }),
      );
    },
    [clearListRefusal],
  );

  const scan = async (): Promise<void> => {
    setScanning(true);
    setStatus("");
    state.recordRemovedGamesScan({ state: "reading" });
    try {
      const result = await withTimeout(getPrunePreview(requestFor("bulk", null, null, 0)), PRUNE_ENDPOINT_TIMEOUT_MS);
      if (!result.success) {
        state.recordRemovedGamesScan({ state: "failed" });
        setStatus(result.message ?? "Cleanup scan failed.");
        return;
      }
      state.recordRemovedGamesScan({ state: "answered", value: result.total ?? 0 });
      if ((result.total ?? 0) === 0) {
        setReviewPreview(null);
        setStatus("No removed RomM entries were found.");
        return;
      }
      if (!result.preview_id) {
        setStatus("Cleanup scan response carried no preview id.");
        return;
      }
      beginPrunePreview(result.preview_id);
      setReviewPreview(result);
      setItems(result.items ?? []);
      setFreeBytes(result.free_bytes ?? 0);
      setIncludedContent(new Set());
      setPageLoadError(null);
      startPageLoad(result.items?.length ?? 0, result.preview_id, result.total ?? 0);
    } catch (e) {
      state.recordRemovedGamesScan({ state: "failed" });
      setStatus(`Could not scan removed RomM games: ${e}`);
      logError(`Removed-game cleanup scan failed: ${e}`);
    } finally {
      setScanning(false);
    }
  };

  const retryPageLoad = (): void => {
    if (!reviewPreview?.preview_id) return;
    setPageLoadError(null);
    clearListRefusal();
    startPageLoad(items.length, reviewPreview.preview_id, reviewPreview.total ?? 0);
  };

  const refreshFreeSpace = async (): Promise<void> => {
    if (!reviewPreview?.preview_id) return;
    try {
      const refreshed = await withTimeout(
        getPrunePreview({
          scope: "bulk" as PruneScope,
          rom_id: null,
          preview_id: reviewPreview.preview_id,
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

  const stop = async (runId: string): Promise<void> => {
    setCancelRequestedFor(runId);
    const failure = await requestPruneCancel(runId);
    if (failure !== null) {
      setCancelRequestedFor(null);
      setStatus(failure);
    }
  };

  const startCleanup = async (): Promise<void> => {
    if (!reviewPreview?.preview_id) return;
    setStarting(true);
    setStatus(
      includedContent.size
        ? `Staging ${includedContent.size} installed-content selection(s)...`
        : "Starting cleanup...",
    );
    try {
      const staged = await stageInstalledSelections(reviewPreview.preview_id, [...includedContent], setStatus);
      if (!staged.ok) return;
      const result = await withTimeout(
        startPrune({
          preview_id: reviewPreview.preview_id,
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
        return;
      }
      if (!result.run_id) {
        setStatus("Cleanup started but the backend response carried no run id.");
        return;
      }
      if (!beginPruneRun(result.run_id, reviewPreview.preview_id)) {
        setStatus("Cleanup started, but lost track of it. Check the log, then re-scan to see the result.");
        return;
      }
      setStatus("Cleanup running...");
    } catch (e) {
      const adopted = getPruneState();
      if (adopted.runId !== null) {
        setStatus(adopted.complete ? "Cleanup completed." : "Cleanup running...");
      } else {
        setStatus(`Cleanup could not start: ${e}`);
      }
    } finally {
      setStarting(false);
    }
  };

  const handleConfirmClick = () => {
    if (blockedReason !== null) {
      setStatus(`Cleanup did not start: ${blockedReason.text}`);
      return;
    }
    detach(
      (async () => {
        const yes = await ask(false, (resolve) => (
          <DesktopConfirmDialog
            titleId="confirm-cleanup-title"
            title="Confirm Cleanup"
            description="Are you sure you want to proceed with this cleanup? Local database entries and shortcuts will be updated or removed."
            confirmLabel="Confirm Cleanup"
            cancelLabel="Cancel"
            tone="danger"
            onChoice={resolve}
          />
        ));
        if (yes) {
          void startCleanup();
        }
      })(),
    );
  };

  const changeRemoveDeadGames = (checked: boolean): void => {
    setRemoveDeadGames(checked);
    if (!checked) {
      setIncludedContent((current) => {
        const stillShown = new Set(items.filter((item) => item.candidate).map((item) => item.rom_id));
        return new Set([...current].filter((romId) => stillShown.has(romId)));
      });
    }
  };

  const changeRecovery = (checked: boolean): void => {
    setRecovery(checked);
    if (checked) setConfirmWithoutRecovery(false);
    else setIncludedContent(new Set());
  };

  const runActive = complete === null && pruneState.runId !== null;

  return (
    <section style={SECTION_STYLE} data-testid="removed-games-detail-pane">
      <SectionHeading title="Gone from RomM" />
      <div style={MUTED_TEXT_STYLE}>
        Games whose entry is gone from your RomM server while this device still holds their shortcut, downloaded files
        and saves. The review below scans for them and shows what removing each one would take with it.
      </div>

      {state.removedGames.state === "failed" && (
        <div style={MUTED_TEXT_STYLE}>The scan failed — press Clean Up Removed RomM Games to try again.</div>
      )}

      {reviewPreview === null && (
        <>
          <div style={BUTTON_ROW_STYLE}>
            <DialogButton
              style={BUTTON_STYLE}
              disabled={scanning || syncRunning || runActive || progress !== null}
              onClick={() => detach(scan())}
            >
              {scanning ? "Scanning…" : "Clean Up Removed RomM Games"}
            </DialogButton>
          </div>
          {scanButtonDescription(syncRunning, runActive) && (
            <div style={MUTED_TEXT_STYLE}>{scanButtonDescription(syncRunning, runActive)}</div>
          )}
        </>
      )}

      {resultLost && <div style={{ ...MUTED_TEXT_STYLE, color: RED }}>{RESULT_LOST_MESSAGE}</div>}

      {runActive && (
        <div style={{ marginTop: "12px" }}>
          {progress && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: TEXT }}>
                <span>
                  {stageLabel(progress.stage)} — {progress.name}
                </span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <ProgressBar
                indeterminate={progress.total <= 0}
                {...(progress.total > 0 ? { nProgress: finishedGroupsPercent(progress.current, progress.total) } : {})}
              />
              {progress.bundle_path && <div style={SUBLINE_STYLE}>{`Recovery sealed: ${progress.bundle_path}`}</div>}
            </div>
          )}
          <div style={SUBLINE_STYLE}>{CANCEL_HINT}</div>
          <div style={BUTTON_ROW_STYLE}>
            <DialogButton style={BUTTON_STYLE} disabled={cancelling} onClick={() => detach(stop(pruneState.runId!))}>
              {cancelling ? "Stopping..." : "Stop Cleanup"}
            </DialogButton>
          </div>
          {cancelling && <div style={SUBLINE_STYLE}>{CANCELLING_HINT}</div>}
        </div>
      )}

      {complete && (
        <div style={{ marginTop: "12px" }}>
          <ProgressBar nProgress={100} />
          <div style={{ ...MUTED_TEXT_STYLE, color: complete.success ? GREEN : RED, fontWeight: 600 }}>
            {`${complete.removed_count ?? complete.removed_rom_ids.length} removed; ${
              complete.problem_count ??
              complete.results.filter((item) => ["partial", "failed", "skipped"].includes(item.status)).length
            } skipped, partial, or failed.`}
          </div>
          <div style={SUBLINE_STYLE}>{completionDescription(complete)}</div>
          {complete.results
            .filter(
              (item) =>
                ["partial", "failed", "skipped"].includes(item.status) ||
                (item.warnings?.length ?? 0) > 0 ||
                item.warnings_omitted ||
                (item.bundle_path !== undefined && removedInGroup(item) === 0),
            )
            .map((item) => (
              <div key={item.group_id} style={{ ...SUBLINE_STYLE, marginTop: "4px" }}>
                <strong>{item.name || item.group_id}:</strong> {item.message}
                {item.warnings?.map((w) => (
                  <div key={w} style={{ color: RED }}>
                    Warning: {w}
                  </div>
                ))}
                {omittedWarnings(item) > 0 && <div>{`${omittedWarnings(item)} additional warning(s) omitted.`}</div>}
              </div>
            ))}
        </div>
      )}

      {status && <div style={{ ...MUTED_TEXT_STYLE, marginTop: "8px" }}>{status}</div>}

      {reviewPreview !== null && (
        <div data-testid="removed-games-review" style={{ marginTop: "16px" }}>
          <div style={{ ...MUTED_TEXT_STYLE, color: TEXT }}>
            {`${candidateTotal} locally kept ${plural(candidateTotal, "version", "versions")} are no longer on your RomM server.`}{" "}
            Nothing is removed until each one is checked against the server again — only entries RomM confirms as gone
            can be deleted.
            {removeDeadGames && total > candidateTotal
              ? " Other versions of the same games are listed below; they stay, unless the check finds every version of a game gone."
              : ""}
          </div>

          <div style={{ marginTop: "12px" }}>
            <SettingsToggle
              label="Remove gone versions"
              description="The confirmed rows and their installed content, in games that still have a live version — never the version a shortcut is on."
              checked={removeRows}
              disabled={runInFlight}
              onChange={setRemoveRows}
            />
            <SettingsToggle
              label="Remove fully vanished games"
              description="Only for games where the server confirms every single version is gone — each is removed whole, with any Steam shortcut it has."
              checked={removeDeadGames}
              disabled={runInFlight}
              onChange={changeRemoveDeadGames}
            />
            <SettingsToggle
              label="Create recovery bundle"
              description={`Verified bundles are sealed under ${reviewPreview.recovery_root ?? "the recovery directory"}.`}
              checked={recovery}
              disabled={runInFlight}
              onChange={changeRecovery}
            />
            {!recovery && (
              <SettingsToggle
                label="I understand there is no recovery bundle"
                description="Local database state and playtime will have no recovery bundle."
                checked={confirmWithoutRecovery}
                disabled={runInFlight}
                onChange={setConfirmWithoutRecovery}
              />
            )}
          </div>

          <div data-testid="cleanup-bar" style={{ marginTop: "14px", padding: "10px", background: "rgba(0,0,0,0.2)" }}>
            <div>
              Selected ROM-content recovery estimate: {formatBytes(selectedBytes)} · Free at target:{" "}
              {formatBytes(freeBytes)}
            </div>
            <div style={SUBLINE_STYLE}>
              A lower bound: the backend remeasures saves, histories, caches and Steam files before anything changes.
            </div>
            {insufficientSpace && (
              <div style={{ color: RED, marginTop: "4px", fontSize: "12px" }}>
                {unknownSelectedSize
                  ? "A selected installed ROM has no safe measurable size."
                  : "Not enough free space."}
              </div>
            )}
            <div style={BUTTON_ROW_STYLE}>
              <DialogButton style={BUTTON_STYLE} disabled={runInFlight} onClick={() => detach(refreshFreeSpace())}>
                Refresh free space
              </DialogButton>
              {pageLoadError !== null && (
                <DialogButton style={BUTTON_STYLE} onClick={retryPageLoad}>
                  Retry loading
                </DialogButton>
              )}
              <DialogButton
                style={BUTTON_STYLE}
                disabled={starting && complete === null}
                onClick={() => setReviewPreview(null)}
              >
                Close review
              </DialogButton>
              <DialogButton style={BUTTON_STYLE} disabled={pressBlocked} onClick={handleConfirmClick}>
                <span style={{ color: RED }}>{confirmButtonLabel(starting, progress)}</span>
              </DialogButton>
            </div>
            {pageLoadError !== null && (
              <div role="status" style={{ color: RED, fontSize: "12px", marginTop: "8px" }}>
                {pageLoadError}
              </div>
            )}
            {blockedReason !== null && !runInFlight && (
              <div style={{ marginTop: "10px", color: RED, fontSize: "12px" }}>{blockedReason.text}</div>
            )}
          </div>

          <table style={TABLE_STYLE} data-testid="cleanup-table">
            <thead>
              <tr data-testid="cleanup-header">
                <th style={TH_STYLE}>Game</th>
                <th style={TH_STYLE}>Platform</th>
                <th style={TH_STYLE}>Verdict</th>
                <th style={{ ...TH_STYLE, ...NUMERIC_STYLE }}>Installed</th>
                <th style={{ ...TH_STYLE, ...NUMERIC_STYLE }}>Keep a copy</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const name = item.name || item.fs_name || `ROM ${item.rom_id}`;
                const verdict = verdictFor(item);
                const version = versionLine(item, name);
                const installedText = !item.installed
                  ? "—"
                  : item.installed_bytes === null
                    ? "unknown"
                    : formatBytes(item.installed_bytes);

                return (
                  <Fragment key={item.rom_id}>
                    {!item.candidate && (index === 0 || visibleItems[index - 1]!.candidate) && (
                      <tr data-testid="cleanup-kept-section">
                        <td colSpan={5} style={{ ...TD_STYLE, fontWeight: 700, paddingTop: "12px" }}>
                          Other versions of these games — still on RomM
                        </td>
                      </tr>
                    )}
                    <tr data-testid={`cleanup-row-${item.rom_id}`}>
                      <td style={TD_STYLE}>
                        <div style={{ fontWeight: item.candidate ? 600 : 400 }}>{name}</div>
                        <div style={SUBLINE_STYLE}>{version}</div>
                        {item.warning && <div style={{ color: RED, fontSize: "12px" }}>{item.warning}</div>}
                      </td>
                      <td style={{ ...TD_STYLE, color: MUTED }}>{item.platform_slug}</td>
                      <td style={TD_STYLE} title={verdict.full}>
                        {verdict.short}
                      </td>
                      <td style={{ ...TD_STYLE, ...NUMERIC_STYLE }}>{installedText}</td>
                      <td style={{ ...TD_STYLE, ...NUMERIC_STYLE }}>
                        {item.installed ? (
                          <Toggle
                            value={includedContent.has(item.rom_id)}
                            disabled={runInFlight || !recovery}
                            onChange={(checked) => toggleContent(item.rom_id, checked)}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {allEntriesLoaded && !visibleItems.some((item) => item.installed) && (
            <div style={{ ...MUTED_TEXT_STYLE, fontStyle: "italic" }}>
              None of these versions has ROM files downloaded on this device, so there is nothing to back up.
            </div>
          )}
        </div>
      )}
    </section>
  );
};
