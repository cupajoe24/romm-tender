/**
 * Multi-version sibling switching and sibling management utility.
 *
 * Encapsulates the version switching lifecycle shared between Big Picture (VersionPicker)
 * and Desktop (DiscSelector):
 *   1. Version list loading, reachability reporting, and bound-vanished publication
 *   2. Lazy per-ROM cover art retrieval and caching
 *   3. Executing version switches with prune lease protection
 *   4. Handling unsynced saves soft-blocks (sync-then-switch, switch anyway, cancel)
 *   5. Surfacing toast feedback and handling unmount/cancellation
 */

import {
  getVersionList,
  switchVersion,
  syncRomSaves,
  refreshSaveStatus,
  fetchCoverBase64,
  logWarn,
  logError,
  type VersionList,
  type VersionInfo,
  type SwitchVersionSuccess,
  type SwitchVersionFailure,
  type SwitchVersionUnsyncedSaves,
} from "../api/backend";
import { reportServerReachable } from "./connectionState";
import { setBoundVanished } from "./vanishedBinding";
import { applyCommittedVersionSwitch } from "./versionSwitchApplication";
import {
  capturePruneLeaseAdmission,
  isPruneLeaseAdmissionCurrent,
  isPruneLeaseCancellation,
  type PruneLeaseAdmission,
} from "./pruneLease";
import { showToast } from "./toast";
import { detach } from "./detach";

export type UnsyncedSavesChoice = "sync_and_switch" | "switch_anyway" | "cancel";

export interface UnsyncedSavesPromptArgs {
  versionName: string;
  serverReachable: boolean;
}

export type UnsyncedSavesPrompt = (args: UnsyncedSavesPromptArgs) => Promise<UnsyncedSavesChoice>;

export interface VersionSwitchOptions {
  appId: number;
  target: VersionInfo;
  leaseOwner: string;
  admission?: PruneLeaseAdmission | undefined;
  askUnsyncedSaves: UnsyncedSavesPrompt;
  onCoverResolved?: ((romId: number, cover: string) => void) | undefined;
  onVanishedRefusal?: (() => void) | undefined;
  setSwitching?: ((switching: boolean) => void) | undefined;
  logTag?: string | undefined;
}

export interface VersionSwitchResult {
  success: boolean;
  cancelled?: boolean | undefined;
  reason?: string | undefined;
}

/**
 * Report server reachability based on version list query results.
 * An explicit server_query_failed marks the server unreachable; a multi-version list
 * that loaded without failure proves the server is reachable.
 */
export function reportVersionListReachability(result: VersionList): void {
  if (result.server_query_failed) {
    reportServerReachable(false);
  } else if (result.multi_version && !result.bound_vanished) {
    reportServerReachable(true);
  }
}

/**
 * Query version list for an app, updating reachability and bound vanished stores
 * if the request is still current.
 */
export async function loadVersionList(appId: number, isCurrent?: () => boolean): Promise<VersionList | null> {
  const result = await getVersionList(appId);
  if (isCurrent && !isCurrent()) return null;
  reportVersionListReachability(result);
  setBoundVanished(appId, result.bound_vanished);
  return result;
}

/**
 * Lazily fetch covers for all versions in a group, deduping against a requested set.
 * Returns a cleanup function that cancels pending in-flight updates on unmount.
 */
export function fetchVersionCovers(
  versions: VersionInfo[] | undefined,
  coversRequested: Set<number>,
  onCover: (romId: number, base64: string) => void,
): () => void {
  if (!versions) return () => {};
  let cancelled = false;
  for (const v of versions) {
    if (coversRequested.has(v.rom_id)) continue;
    coversRequested.add(v.rom_id);
    fetchCoverBase64(v.rom_id)
      .then((result) => {
        if (!cancelled && result.base64) {
          onCover(v.rom_id, result.base64);
        }
      })
      .catch(() => {});
  }
  return () => {
    cancelled = true;
  };
}

/**
 * Execute the complete version switch workflow:
 *   - Guards against active, vanished, or unswitchable versions
 *   - Calls backend switchVersion
 *   - Applies committed switch and shortcut launch options on success
 *   - Prompts for unsynced saves on soft-block and executes sync-then-switch or force switch
 *   - Handles failures, reachability updates, and prune lease cancellation
 */
export async function executeVersionSwitch(options: VersionSwitchOptions): Promise<VersionSwitchResult> {
  const {
    appId,
    target,
    leaseOwner,
    admission: providedAdmission,
    askUnsyncedSaves,
    onCoverResolved,
    onVanishedRefusal,
    setSwitching,
    logTag = "VersionPicker",
  } = options;

  if (target.active || target.vanished || !target.switchable) {
    return { success: false };
  }

  setSwitching?.(true);
  const admission = providedAdmission ?? capturePruneLeaseAdmission(leaseOwner);

  const applySwitchSuccess = async (result: SwitchVersionSuccess): Promise<void> => {
    const confirmed = await applyCommittedVersionSwitch(result, onCoverResolved, admission);
    if (!confirmed) {
      showToast("Switched — re-switch if launch fails");
    }
  };

  const refreshStrandedSaveStatus = (unsyncedRomId: number): void => {
    detach(
      refreshSaveStatus(unsyncedRomId).catch((e) =>
        logWarn(`${logTag}: post-abort save-status refresh failed for rom ${unsyncedRomId}: ${e}`),
      ),
    );
  };

  const handleFailure = (result: SwitchVersionFailure | SwitchVersionUnsyncedSaves): VersionSwitchResult => {
    if (result.reason === "server_unreachable") reportServerReachable(false);
    setSwitching?.(false);
    showToast("Could not switch version", { subtext: result.message });
    if (result.reason === "version_vanished") {
      onVanishedRefusal?.();
    }
    return { success: false, reason: result.reason };
  };

  const syncThenSwitch = async (unsyncedRomId: number): Promise<VersionSwitchResult> => {
    const abort = (body: string): VersionSwitchResult => {
      setSwitching?.(false);
      showToast(body);
      refreshStrandedSaveStatus(unsyncedRomId);
      return { success: false };
    };

    if (!isPruneLeaseAdmissionCurrent(admission)) return { success: false, cancelled: true };
    try {
      const sync = await syncRomSaves(unsyncedRomId);
      if (!isPruneLeaseAdmissionCurrent(admission)) return { success: false, cancelled: true };
      if (!sync.success) {
        return abort("Couldn't sync saves — try again");
      }
      if (sync.conflicts && sync.conflicts.length > 0) {
        return abort("Resolve save conflicts first");
      }
      if (!isPruneLeaseAdmissionCurrent(admission)) return { success: false, cancelled: true };

      const retry = await switchVersion(appId, target.rom_id, false);
      if (retry.success) {
        await applySwitchSuccess(retry);
        return { success: true };
      } else if (retry.reason === "unsynced_saves") {
        return abort("Saves still unsynced — try again");
      } else {
        const failureOutcome = handleFailure(retry);
        refreshStrandedSaveStatus(unsyncedRomId);
        return failureOutcome;
      }
    } catch (e) {
      if (!isPruneLeaseAdmissionCurrent(admission)) return { success: false, cancelled: true };
      logError(`${logTag}: sync-then-switch failed: ${e}`);
      return abort("Couldn't sync saves — try again");
    }
  };

  try {
    const result = await switchVersion(appId, target.rom_id, false);
    if (result.success) {
      await applySwitchSuccess(result);
      return { success: true };
    }

    if (result.reason === "unsynced_saves") {
      reportServerReachable(result.server_reachable);
      const choice = await askUnsyncedSaves({
        versionName: result.unsynced_version_name,
        serverReachable: result.server_reachable,
      });

      if (!isPruneLeaseAdmissionCurrent(admission)) return { success: false, cancelled: true };
      if (choice === "cancel") {
        setSwitching?.(false);
        return { success: false, cancelled: true };
      }

      if (choice === "sync_and_switch") {
        return await syncThenSwitch(result.unsynced_rom_id);
      }

      // "switch_anyway"
      const forced = await switchVersion(appId, target.rom_id, true);
      if (forced.success) {
        await applySwitchSuccess(forced);
        return { success: true };
      }
      return handleFailure(forced);
    }

    return handleFailure(result);
  } catch (e) {
    if (isPruneLeaseCancellation(e, admission)) {
      logWarn(`${logTag}: version switch continuation was cancelled: ${e}`);
      return { success: false, cancelled: true };
    }
    setSwitching?.(false);
    logError(`${logTag}: switchVersion failed: ${e}`);
    showToast("Could not switch version");
    return { success: false };
  }
}
