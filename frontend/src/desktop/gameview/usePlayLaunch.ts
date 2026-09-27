/**
 * Hook managing launch gate orchestration, pre-launch sync, and game execution
 * for the desktop Play button.
 *
 * Encapsulates:
 *   - Pre-launch save sync with timeout and conflict detection
 *   - Launch gate operations (migration, tracking configuration, reachability, drift)
 *   - Steam launch execution and shortcut option reconfirmation
 *   - Stop running game, conflict resolution, and ROM uninstallation
 */

import { useRef } from "react";
import {
  preLaunchSync,
  removeRom,
  debugLog,
  logError,
  invalidateCachedGameDetail,
  getSaveSetupInfo,
  probeReachability,
  checkLocalDrift,
  isSaveTrackingConfigured,
  confirmSlotChoice,
} from "../../api/backend";
import {
  desktopSaveConflictDialog,
  desktopOfflineDriftDialog,
  desktopFallbackLaunchDialog,
  desktopCoreChangeDialog,
} from "./dialogs/desktopDialogs";
import { confirmCoreChangeIfNeeded } from "../../utils/coreChange";
import { activateRunningApp, executeStopRunningGame } from "../../utils/runningGame";
import { announceSaveSync, resolveConflictsSequentially, resolveKnownConflicts } from "../../utils/saveConflictFlow";
import { reportServerReachable } from "../../utils/connectionState";
import { isSessionActive } from "../../utils/sessionManager";
import { isAppRunning } from "../../utils/runningApps";
import { saveSyncToastBody } from "../../utils/saveSyncToast";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";
import { reconfirmLaunchOptions } from "../../utils/launchOptionsReconcile";
import {
  capturePruneLeaseAdmission,
  isPruneLeaseAdmissionCurrent,
  withPruneLease,
  type PruneLeaseAdmission,
} from "../../utils/pruneLease";
import { showToast } from "../../utils/toast";
import { detach } from "../../utils/detach";
import { overviewFor } from "../../utils/steamOverview";
import {
  runLaunchGate,
  markLaunchSkipped,
  type GateVerdict,
  type LaunchGateOps,
  type PreLaunchSyncOutcome,
} from "../../utils/launchGate";
import { getMigrationState } from "../../utils/migrationStore";
import { romHasLaunchTarget, NO_LAUNCH_TARGET_TOAST_BODY } from "../../utils/launchTarget";
import { applyLaunchGateSetupOutcome, resolveSaveSetupOutcome } from "../../utils/saveSetup";
import { BENIGN_SYNC_SKIP_REASONS } from "../../types";
import { refreshSaveStatus } from "../../utils/gameDetailStore";
import type { AskDialog } from "./dialogs/useDialogHost";
import type { PlayButtonState } from "./PlayButton";

interface SteamClientStub {
  Apps?: {
    RunGame?: (appId: string, args: string, flags: number, unk: number) => void;
  };
}

export interface UsePlayLaunchOptions {
  appId: number;
  romId: number | null;
  romName?: string;
  effectiveState: PlayButtonState;
  ask: AskDialog;
  leaseOwner: string;
  setStateOverride: (state: PlayButtonState | null) => void;
  holdVerdict: (state: "play" | "conflict") => void;
  setShowMenu?: (show: boolean) => void;
}

export interface UsePlayLaunchResult {
  handlePlayClick: () => Promise<void>;
  handleResolveConflictClick: () => Promise<void>;
  handleStopClick: () => Promise<void>;
  handleUninstallClick: () => Promise<void>;
  launchGame: () => void;
}

export function usePlayLaunch({
  appId,
  romId,
  romName,
  effectiveState,
  ask,
  leaseOwner,
  setStateOverride,
  holdVerdict,
  setShowMenu,
}: UsePlayLaunchOptions): UsePlayLaunchResult {
  const stopInFlightRef = useRef(false);

  const ensureTrackingConfigured = async (rid: number): Promise<"proceed" | "abort"> => {
    const trackingResult = await isSaveTrackingConfigured(rid).catch(() => ({ configured: true }));
    if (trackingResult.configured) return "proceed";

    let setupInfo;
    try {
      setupInfo = await getSaveSetupInfo(rid);
    } catch {
      return "proceed";
    }

    return applyLaunchGateSetupOutcome(resolveSaveSetupOutcome(setupInfo), {
      rid,
      confirmSlotChoice,
      toast: (body) => showToast(body),
      dispatchSavesTab: () =>
        globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "saves" } })),
    });
  };

  const confirmCoreChange = (rid: number) => confirmCoreChangeIfNeeded(rid, desktopCoreChangeDialog(ask));

  const runPreLaunchSync = async (rid: number): Promise<PreLaunchSyncOutcome> => {
    setStateOverride("syncing");
    let result: Awaited<ReturnType<typeof preLaunchSync>>;
    try {
      result = await Promise.race([
        preLaunchSync(rid),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);
    } catch (e) {
      detach(debugLog(`DesktopPlayButton: pre-launch sync failed: ${e}`));
      return { success: false, message: "" };
    }

    if (result.reason !== undefined && BENIGN_SYNC_SKIP_REASONS.includes(result.reason)) {
      detach(debugLog(`DesktopPlayButton: pre-launch sync skipped (${result.reason}) — launching`));
      return { success: true, message: result.message };
    }

    if (result.conflicts && result.conflicts.length > 0) {
      return { success: result.success, message: result.message, conflicts: result.conflicts };
    }

    if (!result.success) {
      detach(
        debugLog(
          `DesktopPlayButton: pre-launch sync failed: reason=${result.reason ?? ""} errors=[${result.errors?.join(", ") ?? ""}] message=${result.message}`,
        ),
      );
      return { success: false, message: result.message };
    }

    const toastBody = saveSyncToastBody(result.uploaded, result.downloaded);
    if (toastBody) {
      showToast(toastBody);
    }
    return { success: true, message: result.message };
  };

  const makePlayButtonOps = (rid: number): LaunchGateOps => ({
    migrationPending: () => getMigrationState().pending,
    hasLaunchTarget: () => romHasLaunchTarget(rid, "DesktopPlayButton"),
    ensureTrackingConfigured: () => ensureTrackingConfigured(rid),
    checkCoreChange: () => confirmCoreChange(rid),
    checkReachability: async () => {
      try {
        const { online } = await probeReachability();
        reportServerReachable(online);
        return online;
      } catch (e) {
        logError(`DesktopPlayButton: reachability probe failed (treating as offline): ${e}`);
        return false;
      }
    },
    preLaunchSync: () => runPreLaunchSync(rid),
    checkLocalDrift: async () =>
      (
        await checkLocalDrift(rid).catch((e) => {
          logError(`DesktopPlayButton: local-drift check failed (treating as not-drifted): ${e}`);
          return { drifted: false, rom_id: rid };
        })
      ).drifted,
  });

  const launchGame = () => {
    const overview = overviewFor(appId);
    const gameId = overview?.GetGameID?.() ?? String(appId);

    markLaunchSkipped(appId);

    const winClient = (window as unknown as { SteamClient?: SteamClientStub }).SteamClient;
    const globalClient = (globalThis as unknown as { SteamClient?: SteamClientStub }).SteamClient;
    const client = winClient || globalClient;

    if (client?.Apps?.RunGame) {
      client.Apps.RunGame(gameId, "", -1, 100);
    }
  };

  const dispatchLaunch = async (_gameId: string, admission: PruneLeaseAdmission) => {
    if (!isPruneLeaseAdmissionCurrent(admission)) return;
    setStateOverride("launching");
    if (romId) {
      try {
        const reconfirm = await reconfirmLaunchOptions(romId, appId, "DesktopPlayButton", admission);
        if (reconfirm.status === "cancelled") return;
        if (reconfirm.status === "timeout") {
          setStateOverride(null);
          return;
        }
      } catch {
        // Best-effort
      }
    }

    launchGame();
    setTimeout(() => {
      setStateOverride(null);
    }, 2000);
  };

  const actOnVerdict = async (
    verdict: GateVerdict,
    gameId: string,
    rid: number,
    admission: PruneLeaseAdmission,
  ): Promise<"done" | "retry"> => {
    switch (verdict.decision) {
      case "allow":
        await dispatchLaunch(gameId, admission);
        return "done";
      case "abort":
      case "block":
        if (verdict.decision === "block" && verdict.reason === "no_launch_target") {
          showToast(NO_LAUNCH_TARGET_TOAST_BODY);
        }
        setStateOverride(null);
        return "done";
      case "conflict": {
        const resolution = await resolveConflictsSequentially(verdict.conflicts, desktopSaveConflictDialog(ask));
        if (resolution === "cancel") {
          setStateOverride(null);
          holdVerdict("conflict");
          detach(refreshSaveStatus(appId));
          return "done";
        }
        announceSaveSync(rid);
        await dispatchLaunch(gameId, admission);
        return "done";
      }
      case "offline_drift": {
        const askDrift = desktopOfflineDriftDialog(ask);
        const choice = await askDrift();
        if (choice === "start_anyway") {
          await dispatchLaunch(gameId, admission);
          return "done";
        }
        if (choice === "retry") {
          setStateOverride("syncing");
          return "retry";
        }
        setStateOverride(null);
        return "done";
      }
      case "sync_failed": {
        const askFallback = desktopFallbackLaunchDialog(ask);
        const proceed = await askFallback(verdict.message);
        if (proceed) {
          await dispatchLaunch(gameId, admission);
          return "done";
        }
        setStateOverride(null);
        return "done";
      }
    }
  };

  const handlePlayClick = async () => {
    if (!romId || effectiveState === "syncing" || effectiveState === "launching") return;

    // Already running -> bring to front without re-entering launch gate or RunGame
    if (isSessionActive(romId) || isAppRunning(appId)) {
      activateRunningApp(appId, "DesktopPlayButton");
      return;
    }

    // Stale overlay self-heal: if Resume was pressed while nothing is actually running
    if (effectiveState === "running") {
      detach(debugLog(`DesktopPlayButton: Resume on appId=${appId} but nothing is running — self-healing to launch`));
      setStateOverride(null);
    }

    const overview = overviewFor(appId);
    const gameId = overview?.GetGameID?.() ?? String(appId);
    const admission = capturePruneLeaseAdmission(leaseOwner);

    try {
      let verdict = await runLaunchGate(appId, romId, makePlayButtonOps(romId));
      while ((await actOnVerdict(verdict, gameId, romId, admission)) === "retry") {
        verdict = await runLaunchGate(appId, romId, makePlayButtonOps(romId));
      }
    } catch (e) {
      detach(debugLog(`DesktopPlayButton: handlePlay unexpected error — resetting: ${e}`));
      setStateOverride(null);
    }
  };

  const handleResolveConflictClick = async () => {
    if (!romId) return;
    setStateOverride("syncing");
    const outcome = await resolveKnownConflicts(
      romId,
      (conflicts) => resolveConflictsSequentially(conflicts, desktopSaveConflictDialog(ask)),
      "DesktopPlayButton",
    );
    setStateOverride(null);
    if (outcome === "resolved") holdVerdict("play");
  };

  const handleStopClick = async () => {
    await executeStopRunningGame({
      appId,
      romId,
      tag: "DesktopPlayButton",
      stopInFlightRef,
      onClearOverlay: () => setStateOverride(null),
    });
  };

  const handleUninstallClick = async () => {
    if (!romId) return;
    setShowMenu?.(false);
    setStateOverride("uninstalling");

    const admission = capturePruneLeaseAdmission(leaseOwner);
    try {
      const result = await removeRom(romId);
      if (result.success) {
        await withPruneLease(
          result.prune_lease_token,
          "ROM uninstall",
          async (signal) => {
            if (signal.aborted) return;
            await setLaunchOptionsConfirmed(appId, "").catch(() => false);
          },
          leaseOwner,
          admission,
        );
        globalThis.dispatchEvent(new CustomEvent("romm_rom_uninstalled", { detail: { rom_id: romId } }));
        invalidateCachedGameDetail(appId);
        showToast(`${romName || "ROM"} uninstalled`);
        setStateOverride(null);
      } else {
        showToast(result.message || "Uninstall failed");
        setStateOverride(null);
      }
    } catch {
      showToast("Uninstall failed");
      setStateOverride(null);
    }
  };

  return {
    handlePlayClick,
    handleResolveConflictClick,
    handleStopClick,
    handleUninstallClick,
    launchGame,
  };
}
