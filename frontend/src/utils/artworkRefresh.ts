/**
 * Refresh a ROM's artwork: reloads the RomM cover where the cover is on
 * automatic, resolves and applies SteamGridDB artwork to the slots on
 * automatic (hero, logo, wide grid, icon), and announces the outcome.
 */

import {
  refreshCoverArtwork,
  getSgdbResolution,
  refreshSgdbArtwork,
  setArtworkSlotAutomatic,
  debugLog,
  isEndpointFailure,
} from "../api/backend";
import type { WireReason } from "../types/reasons";
import { applyAutomaticArtwork, applyTabSlotImage } from "./artwork";
import { artworkApplyMessage } from "./artworkApplyMessage";
import { loadArtworkSlots } from "./artworkSlotsStore";
import { CHOOSE_GAME_FIRST } from "./artworkTabWording";
import { capturePruneLeaseAdmission, isPruneLeaseCancellation } from "./pruneLease";
import { showToast } from "./toast";
import { detach } from "./detach";

export interface RefreshArtworkOptions {
  romId: number;
  appId: number;
  leaseOwner?: string;
  tag?: string;
  /** What is said while the ROM has no SteamGridDB game: where the surface offers the choice. */
  chooseGameFirst?: string;
}

/** What reloading the cover came to: why it failed, `null` once reloaded, and whether it is Tender's SteamGridDB pick. */
interface CoverReload {
  failure: string | null;
  steamGridDb: boolean;
}

/**
 * Reload RomM's cover for *romId* and hand it to Steam — where RomM has none, Tender's pick from SteamGridDB's covers,
 * downloaded anew and set (#2381 D23, D25) — and tell the game info panel.
 */
async function refreshRommCover(romId: number, appId: number): Promise<CoverReload> {
  // Re-download the RomM cover, rename to {app_id}p.png, and patch
  // cover_path on the registry row so the game info panel can render the
  // refreshed image.
  const coverResult = await refreshCoverArtwork(romId).catch(
    (
      e,
    ): {
      success: boolean;
      reason?: WireReason | "exception";
      message: string;
      cover_path?: string;
      prune_lease_token?: string;
    } => {
      detach(debugLog(`refreshCoverArtwork rejected: ${e}`));
      return { success: false, reason: "exception", message: "the request did not complete" };
    },
  );
  let steamGridDb = false;
  if (coverResult.success) {
    await setRommCoverInSteam(romId, appId, coverResult.prune_lease_token);
  } else {
    detach(debugLog(`refreshCoverArtwork failed: ${coverResult.reason} — ${coverResult.message}`));
    if (coverResult.reason !== "no_cover") return { failure: coverResult.message, steamGridDb };
    const failure = await setSteamGridDbCover(romId, appId);
    if (failure !== null) return { failure: failure ?? coverResult.message, steamGridDb };
    steamGridDb = true;
  }
  // Notify the game info panel so it can re-render the cover image.
  globalThis.dispatchEvent(
    new CustomEvent("romm_data_changed", {
      detail: { type: "cover_refreshed", rom_id: romId },
    }),
  );
  return { failure: null, steamGridDb };
}

/**
 * Hand Steam the RomM cover the backend just reloaded, under the lease the reload answered with, as the ARTWORK tab's
 * Automatic sets RomM's cover: the grid file alone shows only after Steam restarts. A write that fails is logged; the
 * reload stands.
 */
async function setRommCoverInSteam(romId: number, appId: number, leaseToken: string | undefined): Promise<void> {
  if (!leaseToken) return;
  const outcome = await applyTabSlotImage(
    romId,
    appId,
    "cover",
    { status: "cover", prune_lease_token: leaseToken },
    false,
  ).catch((e: unknown) => {
    detach(debugLog(`Refresh Artwork: RomM's cover for appId ${appId} was not handed to Steam: ${e}`));
    return null;
  });
  if (outcome === "refused") detach(debugLog(`Refresh Artwork: Steam refused RomM's cover for appId ${appId}`));
}

/**
 * Set the cover back to automatic for a game RomM has no cover for, which serves Tender's pick from SteamGridDB, and
 * hand it to Steam. `null` once Steam took it; why not otherwise, `undefined` where no answer came.
 */
async function setSteamGridDbCover(romId: number, appId: number): Promise<string | null | undefined> {
  const answer = await setArtworkSlotAutomatic(romId, "cover").catch((e: unknown) => {
    detach(debugLog(`Refresh Artwork: the SteamGridDB cover for rom ${romId} was not served: ${e}`));
    return null;
  });
  if (!answer) return undefined;
  if (isEndpointFailure(answer)) return answer.message;
  const outcome = await applyTabSlotImage(romId, appId, "cover", answer, false);
  return outcome === "set" ? null : "Steam did not take the cover from SteamGridDB";
}

/**
 * Refresh Artwork, start to finish: it toasts what came of it and never throws.
 * The slots are read again once it ends, whatever it came to, so the surface's
 * view of them follows what was written.
 */
export async function executeRefreshArtwork(options: RefreshArtworkOptions): Promise<void> {
  const {
    romId,
    appId,
    leaseOwner = `game-detail:${appId}`,
    tag = "handleRefreshArtwork",
    chooseGameFirst = CHOOSE_GAME_FIRST,
  } = options;
  const admission = capturePruneLeaseAdmission(leaseOwner);
  let coverFailure: string | null = null;
  let coverFromSteamGridDb = false;
  const say = (sgdbResult: string) => {
    if (!coverFailure || coverFailure === sgdbResult) {
      showToast(sgdbResult);
      return;
    }
    showToast(`${sgdbResult.replace(/\.$/, "")}. The RomM cover could not be updated: ${coverFailure}`);
  };

  try {
    // What each slot is decides what Refresh Artwork may replace: the cover
    // only on automatic, the SteamGridDB slots only on automatic, never a
    // slot the user chose or one set in Steam (#2381 D6).
    const slots = await loadArtworkSlots(appId, romId);
    if (!slots) {
      showToast("Failed to refresh artwork");
      return;
    }
    if (slots.game.sgdb_id === null) {
      showToast(chooseGameFirst);
      return;
    }
    if (slots.slots.some((row) => row.slot === "cover" && row.state === "automatic")) {
      const reload = await refreshRommCover(romId, appId);
      coverFailure = reload.failure;
      coverFromSteamGridDb = reload.steamGridDb;
    }

    const resolution = await getSgdbResolution(romId).catch((e): null => {
      detach(debugLog(`getSgdbResolution rejected: ${e}`));
      return null;
    });
    if (!resolution) {
      say("Failed to refresh artwork");
      return;
    }
    if (isEndpointFailure(resolution)) {
      say(resolution.message);
      return;
    }

    switch (resolution.decision) {
      case "no_api_key":
        say("Set a SteamGridDB API key in Settings first");
        break;
      case "resolved": {
        const refreshed = await refreshSgdbArtwork(romId, resolution.sgdb_id);
        if (isEndpointFailure(refreshed)) {
          say(refreshed.message);
          break;
        }
        say(artworkApplyMessage(await applyAutomaticArtwork(romId, appId), coverFromSteamGridDb));
        break;
      }
      case "needs_pick":
        // Refresh Artwork never chooses the game (#2381 D3): that is a choice of
        // its own, wherever the surface offers it.
        say(chooseGameFirst);
        break;
    }
  } catch (e) {
    // Leaving the game page cancels the artwork continuation mid-apply — that is
    // teardown, not a refresh failure, so it must not toast at the next surface.
    if (isPruneLeaseCancellation(e, admission)) {
      detach(debugLog(`${tag}: continuation was cancelled: ${e}`));
      return;
    }
    say("Failed to refresh artwork");
  } finally {
    detach(loadArtworkSlots(appId, romId));
  }
}
