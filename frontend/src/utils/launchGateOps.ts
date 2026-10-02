/**
 * The gate's inputs ({@link LaunchGateOps}) for one ROM — the parts every launch
 * path asks the same way, built once here. A path supplies the two steps that put
 * something to the user, since only it knows where it may ask: the tracking setup
 * and the core-change question.
 */

import {
  checkLocalDrift,
  confirmSlotChoice,
  debugLog,
  getSaveSetupInfo,
  isSaveTrackingConfigured,
  logError,
  preLaunchSync,
  probeReachability,
} from "../api/backend";
import { BENIGN_SYNC_SKIP_REASONS } from "../types";
import { reportServerReachable } from "./connectionState";
import { detach } from "./detach";
import type { LaunchGateOps, PreLaunchSyncOutcome } from "./launchGate";
import { romHasLaunchTarget } from "./launchTarget";
import { getMigrationState } from "./migrationStore";
import { saveSyncToastBody } from "./saveSyncToast";
import { applyLaunchGateSetupOutcome, resolveSaveSetupOutcome } from "./saveSetup";
import { showToast } from "./toast";
import { withTimeout } from "./withTimeout";

export const PRE_LAUNCH_SYNC_TIMEOUT_MS = 15000;

export interface PreLaunchSyncOptions {
  /** Prefixes every log line, naming the launch path. */
  tag: string;
  /** Toast what a successful sync moved (`saveSyncToastBody`); a path with no page to toast over passes `false`. */
  toastSyncResult: boolean;
}

/**
 * Run the pre-launch sync for `romId` and shape its answer for the gate.
 *
 * - A benign skip (`BENIGN_SYNC_SKIP_REASONS`) is a success: sync did not run and
 *   nothing is wrong, a standing fact about the machine that a confirm on every
 *   launch would only nag about.
 * - Conflicts pass through for the gate to route.
 * - Any other failure is `{ success: false, message }`, including one with no
 *   `errors` (`DEVICE_NOT_REGISTERED`, `blocked_by_migration`,
 *   `blocked_by_update`): sync did not run, so the user must not play on stale
 *   saves believing it did.
 * - A throw or a hang past {@link PRE_LAUNCH_SYNC_TIMEOUT_MS} is
 *   `{ success: false, message: "" }`. It must not propagate: the gate fails open
 *   on a throw, which would launch silently on stale saves. The empty message
 *   leaves the fallback prompt its own default sentence.
 */
export async function runPreLaunchSync(romId: number, options: PreLaunchSyncOptions): Promise<PreLaunchSyncOutcome> {
  const { tag } = options;
  let result: Awaited<ReturnType<typeof preLaunchSync>>;
  try {
    result = await withTimeout(preLaunchSync(romId), PRE_LAUNCH_SYNC_TIMEOUT_MS);
  } catch (e) {
    logError(`${tag}: pre-launch sync failed (surfacing fallback confirm): ${e}`);
    return { success: false, message: "" };
  }

  detach(
    debugLog(
      `${tag}: preLaunchSync result: synced=${result.synced} conflicts=${result.conflicts?.length ?? 0} success=${result.success}`,
    ),
  );

  if (result.reason !== undefined && BENIGN_SYNC_SKIP_REASONS.includes(result.reason)) {
    detach(debugLog(`${tag}: pre-launch sync skipped (${result.reason}) — launching`));
    return { success: true, message: result.message };
  }

  if (result.conflicts && result.conflicts.length > 0) {
    return { success: result.success, message: result.message, conflicts: result.conflicts };
  }

  if (!result.success) {
    detach(
      debugLog(
        `${tag}: pre-launch sync failed: reason=${result.reason ?? ""} errors=[${result.errors?.join(", ") ?? ""}] message=${result.message}`,
      ),
    );
    return { success: false, message: result.message };
  }

  if (options.toastSyncResult) {
    const toastBody = saveSyncToastBody(result.uploaded, result.downloaded);
    if (toastBody) showToast(toastBody);
  }
  return { success: true, message: result.message };
}

/**
 * The tracking-setup step for a start pressed on an open game page: a slot the
 * user must choose aborts the start with a toast and switches the page to its
 * saves tab; a default the backend can adopt is adopted and the start proceeds.
 * A failed read proceeds — setup never blocks a launch on a network error.
 *
 * The try guards only the network call. The branching on its answer sits outside
 * it so that a throw from a side effect (the toast, the tab switch, the slot
 * confirm) cannot be swallowed into "proceed" and launch past an "abort".
 */
export async function ensureTrackingConfiguredOnPage(romId: number): Promise<"proceed" | "abort"> {
  const trackingResult = await isSaveTrackingConfigured(romId).catch(() => ({ configured: true }));
  if (trackingResult.configured) return "proceed";

  let setupInfo;
  try {
    setupInfo = await getSaveSetupInfo(romId);
  } catch {
    return "proceed";
  }

  return applyLaunchGateSetupOutcome(resolveSaveSetupOutcome(setupInfo), {
    rid: romId,
    confirmSlotChoice,
    toast: (body) => showToast(body),
    dispatchSavesTab: () => globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "saves" } })),
  });
}

export interface LaunchGateOpsOptions extends PreLaunchSyncOptions {
  ensureTrackingConfigured: () => Promise<"proceed" | "abort">;
  checkCoreChange: () => Promise<boolean>;
  /** Called as the pre-launch sync starts, for a trigger that shows it. */
  onSyncStart?: () => void;
}

/**
 * The gate's inputs for `romId`. Reachability is a fresh probe at start time;
 * a probe that answers feeds the shared connection store, while a probe that
 * throws is a bridge error rather than a server verdict, so it leaves the store
 * alone and the start treats it as offline. A drift check that throws reads as
 * not drifted.
 */
export function makeLaunchGateOps(romId: number, options: LaunchGateOpsOptions): LaunchGateOps {
  const { tag } = options;
  return {
    migrationPending: () => getMigrationState().pending,
    hasLaunchTarget: () => romHasLaunchTarget(romId, tag),
    ensureTrackingConfigured: options.ensureTrackingConfigured,
    checkCoreChange: options.checkCoreChange,
    checkReachability: async () => {
      try {
        const { online } = await probeReachability();
        reportServerReachable(online);
        return online;
      } catch (e) {
        logError(`${tag}: reachability probe failed (treating as offline): ${e}`);
        return false;
      }
    },
    preLaunchSync: () => {
      options.onSyncStart?.();
      return runPreLaunchSync(romId, options);
    },
    checkLocalDrift: async () =>
      (
        await checkLocalDrift(romId).catch((e) => {
          logError(`${tag}: local-drift check failed (treating as not-drifted): ${e}`);
          return { drifted: false };
        })
      ).drifted,
  };
}
