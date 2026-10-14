/**
 * The game page's automatic SteamGridDB artwork apply.
 */

import { useEffect } from "react";
import { applyArtwork } from "./artwork";
import { debugLog } from "../api/backend";

/** Which rom_id each appId has had auto-artwork applied for this session. Keyed
 *  on the pair, not the appId alone: a version switch re-binds the appId to a
 *  new rom_id whose artwork has to be applied afresh (#1298 item 3). */
const artworkApplied = new Map<number, number>();

export function _resetArtworkAppliedForTests(): void {
  artworkApplied.clear();
}

/**
 * @param appId Steam shortcut App ID
 * @param romId RomM ROM ID, or null if unassigned / unknown
 * @param logContext Prefix for debug logging on failure
 */
export function useAutoArtwork(appId: number, romId: number | null, logContext: string = "Auto-artwork error"): void {
  // Auto-apply SGDB artwork on first visit, once per (appId, rom_id) — so a
  // version switch re-applies for the newly bound rom_id (#1298 item 3). Only
  // marked applied after success, so a transient failure retries next visit.
  useEffect(() => {
    if (!romId || artworkApplied.get(appId) === romId) return;
    applyArtwork(romId, appId)
      .then(() => {
        artworkApplied.set(appId, romId);
      })
      .catch((e) => debugLog(`${logContext}: ${e}`));
  }, [appId, romId, logContext]);
}
