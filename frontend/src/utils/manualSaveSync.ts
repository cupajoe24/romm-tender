/**
 * Manual save sync action shared between Big Picture (RomMPlaySection) and Desktop (SaveManagementCard).
 *
 * Runs `syncRomSaves(romId)`, handles directional toast copy or "already up to date",
 * surfaces conflict counts, dispatches `romm_data_changed` event, and records sync display.
 */

import { syncRomSaves } from "../api/backend";
import { showToast } from "./toast";
import { saveSyncToastBody } from "./saveSyncToast";
import { noteSaveSyncDisplay } from "./gameDetailStore";

export async function executeManualSaveSync(appId: number, romId: number): Promise<boolean> {
  try {
    const result = await syncRomSaves(romId);
    if (result.success) {
      const directionalBody = saveSyncToastBody(result.uploaded, result.downloaded);
      const c = result.conflicts?.length ?? 0;
      if (directionalBody) {
        showToast(directionalBody);
      } else if (c === 0) {
        showToast("Saves already up to date");
      }
      if (c > 0) {
        showToast(`${c} conflict(s) need resolution`);
      }
      globalThis.dispatchEvent(new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }));
      noteSaveSyncDisplay(appId, romId, { status: "synced", label: "Just now", last_sync_check_at: null });
      return true;
    }
    showToast(result.message || "Save sync failed");
    return false;
  } catch {
    showToast("Save sync failed");
    return false;
  }
}
