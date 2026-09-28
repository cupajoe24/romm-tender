/**
 * ROM uninstallation lifecycle utility.
 *
 * Encapsulates the complete removal workflow shared between Desktop and Big Picture:
 *   1. Capturing prune lease admission
 *   2. Invoking backend `remove_rom`
 *   3. Executing the prune lease continuation (clearing shortcut launch options and dispatching `romm_rom_uninstalled`)
 *   4. Invalidating cached game detail
 *   5. Surfacing toast feedback and handling unmount/cancellation without false error toasts
 */

import { removeRom, debugLog } from "../api/backend";
import { invalidateCachedGameDetail } from "./cachedGameDetailStore";
import { setLaunchOptionsConfirmed } from "./steamShortcuts";
import {
  capturePruneLeaseAdmission,
  isPruneLeaseCancelled,
  isPruneLeaseCancellation,
  withPruneLease,
  type PruneLeaseAdmission,
} from "./pruneLease";
import { showToast } from "./toast";
import { detach } from "./detach";

export interface RomUninstallOptions {
  romId: number;
  appId: number;
  romName?: string | undefined;
  leaseOwner: string;
  admission?: PruneLeaseAdmission | undefined;
  tag?: string | undefined;
  context?: string | undefined;
}

export interface RomUninstallResult {
  success: boolean;
  message?: string | undefined;
  cancelled?: boolean | undefined;
}

export async function executeRomUninstall(options: RomUninstallOptions): Promise<RomUninstallResult> {
  const { romId, appId, romName, leaseOwner, admission, tag = "handleUninstall", context = "ROM uninstall" } = options;
  const currentAdmission = admission ?? capturePruneLeaseAdmission(leaseOwner);

  try {
    const result = await removeRom(romId);
    if (!result.success) {
      showToast(result.message || "Uninstall failed");
      return { success: false, message: result.message };
    }

    // Reset the now-stale launch command to the uninstalled "" placeholder so a
    // raced-past not_installed launch execs `bin/tender-rom-launcher` with no args (clean
    // exit 1) instead of a stale `flatpak run … "<deleted path>"` (#1051). Best-effort:
    // a launch-options hiccup must not turn a successful uninstall into an error.
    await withPruneLease(
      result.prune_lease_token,
      context,
      async (signal) => {
        if (isPruneLeaseCancelled(signal)) return;
        await setLaunchOptionsConfirmed(appId, "").catch(() => false);
        if (isPruneLeaseCancelled(signal)) return;
        globalThis.dispatchEvent(new CustomEvent("romm_rom_uninstalled", { detail: { rom_id: romId } }));
      },
      leaseOwner,
      currentAdmission,
    );

    invalidateCachedGameDetail(appId);
    showToast(`${romName || "ROM"} uninstalled`);
    return { success: true };
  } catch (e) {
    // The backend uninstall already committed before the continuation was torn
    // down; reporting it as a failure would be a lie the user can't act on.
    if (isPruneLeaseCancellation(e, currentAdmission)) {
      detach(debugLog(`${tag}: continuation was cancelled: ${e}`));
      return { success: false, cancelled: true };
    }
    showToast("Uninstall failed");
    return { success: false, message: e instanceof Error ? e.message : "Uninstall failed" };
  }
}
