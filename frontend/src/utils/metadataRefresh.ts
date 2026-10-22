/**
 * Refresh a ROM's metadata from RomM: fetches metadata, announces it via toast
 * and `romm_data_changed`.
 */

import { getRomMetadata } from "../api/backend";
import { showToast } from "./toast";

/** Refresh a ROM's metadata from RomM. */
export async function executeRefreshMetadata(romId: number): Promise<void> {
  try {
    await getRomMetadata(romId);
    showToast("Metadata refreshed");
    globalThis.dispatchEvent(new CustomEvent("romm_data_changed", { detail: { type: "metadata", rom_id: romId } }));
  } catch {
    showToast("Failed to refresh metadata");
  }
}
