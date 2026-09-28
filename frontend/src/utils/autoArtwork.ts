/**
 * Auto-artwork application on first visit for a ROM shortcut.
 *
 * Automatically fetches and applies SteamGridDB artwork once per (appId, romId) pair.
 * Cancels in-flight artwork application on unmount.
 */

import { useEffect } from "react";
import { applyArtwork, cancelArtworkApply } from "./artwork";
import { debugLog } from "../api/backend";
import { detach } from "./detach";

/**
 * Which rom_id each appId has had auto-artwork applied for this session.
 * Keyed on the pair (appId, rom_id) — a version switch re-binds the appId
 * to a new rom_id whose artwork has to be applied afresh (#1298 item 3).
 * Only marked applied after success, so a transient failure retries next visit.
 */
const artworkApplied = new Map<number, number>();

export function _resetArtworkAppliedForTests(): void {
  artworkApplied.clear();
}

/**
 * Hook to auto-apply SteamGridDB artwork once per (appId, romId) pair.
 *
 * @param appId Steam shortcut App ID
 * @param romId RomM ROM ID, or null if unassigned / unknown
 * @param logContext Prefix for debug logging on failure
 */
export function useAutoArtwork(appId: number, romId: number | null, logContext: string = "Auto-artwork error"): void {
  useEffect(() => {
    return () => {
      detach(cancelArtworkApply(appId));
    };
  }, [appId]);

  useEffect(() => {
    if (!romId || artworkApplied.get(appId) === romId) return;
    applyArtwork(romId, appId)
      .then(() => {
        artworkApplied.set(appId, romId);
      })
      .catch((e) => debugLog(`${logContext}: ${e}`));
  }, [appId, romId, logContext]);
}
