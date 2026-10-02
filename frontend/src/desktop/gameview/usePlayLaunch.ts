/**
 * The desktop Play button's actions: a launch through the shared gate
 * (`utils/launchGateOps.ts`, `utils/launchVerdict.ts`) asked through the desktop
 * dialogs, the Steam start with its shortcut-option re-confirm, Stop, Resolve
 * Conflict and Uninstall.
 */

import { useRef } from "react";
import { debugLog } from "../../api/backend";
import { executeRomUninstall } from "../../utils/romUninstall";
import { desktopLaunchPrompts } from "./dialogs/desktopDialogs";
import { confirmCoreChangeIfNeeded } from "../../utils/coreChange";
import { activateRunningApp, executeStopRunningGame } from "../../utils/runningGame";
import { resolveKnownConflicts } from "../../utils/saveConflictFlow";
import { readGameRunning } from "../../utils/sessionManager";
import { reconfirmLaunchOptions } from "../../utils/launchOptionsReconcile";
import {
  capturePruneLeaseAdmission,
  isPruneLeaseAdmissionCurrent,
  type PruneLeaseAdmission,
} from "../../utils/pruneLease";
import { detach } from "../../utils/detach";
import { overviewFor } from "../../utils/steamOverview";
import { markLaunchSkipped } from "../../utils/launchGate";
import { ensureTrackingConfiguredOnPage, makeLaunchGateOps } from "../../utils/launchGateOps";
import { runGateLoop } from "../../utils/launchVerdict";
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
  /** Drop the button's running state when the game turns out not to be running. */
  clearSessionRunning?: () => void;
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
  clearSessionRunning,
  holdVerdict,
  setShowMenu,
}: UsePlayLaunchOptions): UsePlayLaunchResult {
  const stopInFlightRef = useRef(false);

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

  const handlePlayClick = async () => {
    if (!romId || effectiveState === "syncing" || effectiveState === "launching") return;

    // Already running -> bring to front without re-entering launch gate or RunGame
    if (readGameRunning(appId, romId).running) {
      activateRunningApp(appId, "DesktopPlayButton");
      return;
    }

    // Stale overlay self-heal: if Resume was pressed while nothing is actually running
    if (effectiveState === "running") {
      detach(debugLog(`DesktopPlayButton: Resume on appId=${appId} but nothing is running — self-healing to launch`));
      clearSessionRunning?.();
      setStateOverride(null);
    }

    const overview = overviewFor(appId);
    const gameId = overview?.GetGameID?.() ?? String(appId);
    const admission = capturePruneLeaseAdmission(leaseOwner);

    const prompts = desktopLaunchPrompts(ask);
    try {
      const ops = makeLaunchGateOps(romId, {
        tag: "DesktopPlayButton",
        toastSyncResult: true,
        onSyncStart: () => setStateOverride("syncing"),
        ensureTrackingConfigured: () => ensureTrackingConfiguredOnPage(romId),
        checkCoreChange: () => confirmCoreChangeIfNeeded(romId, prompts.confirmCoreChange),
      });
      await runGateLoop(appId, romId, ops, {
        prompts,
        launch: () => dispatchLaunch(gameId, admission),
        onDeclined: () => setStateOverride(null),
        onMigrationBlocked: () => setStateOverride(null),
        onConflictCancelled: () => {
          setStateOverride(null);
          holdVerdict("conflict");
          detach(refreshSaveStatus(appId));
        },
        onRetry: () => setStateOverride("syncing"),
      });
    } catch (e) {
      detach(debugLog(`DesktopPlayButton: handlePlay unexpected error — resetting: ${e}`));
      setStateOverride(null);
    }
  };

  const handleResolveConflictClick = async () => {
    if (!romId) return;
    setStateOverride("syncing");
    const outcome = await resolveKnownConflicts(romId, desktopLaunchPrompts(ask).resolveConflicts, "DesktopPlayButton");
    setStateOverride(null);
    if (outcome === "resolved") holdVerdict("play");
  };

  const handleStopClick = async () => {
    await executeStopRunningGame({
      appId,
      romId,
      tag: "DesktopPlayButton",
      stopInFlightRef,
      onClearOverlay: () => {
        clearSessionRunning?.();
        setStateOverride(null);
      },
    });
  };

  const handleUninstallClick = async () => {
    if (!romId) return;
    setShowMenu?.(false);
    setStateOverride("uninstalling");

    const result = await executeRomUninstall({
      romId,
      appId,
      romName,
      leaseOwner,
      tag: "DesktopPlayButton",
    });

    if (result.success) {
      setStateOverride("download");
    } else {
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
