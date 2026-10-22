/**
 * Refresh a ROM's artwork: re-downloads the RomM cover, resolves and applies
 * SteamGridDB artwork (hero, logo, wide grid, icon), and announces the outcome.
 */

import {
  refreshCoverArtwork,
  getSgdbResolution,
  refreshSgdbArtwork,
  debugLog,
  isEndpointFailure,
  type SgdbCandidate,
} from "../api/backend";
import type { WireReason } from "../types/reasons";
import { applyArtwork } from "./artwork";
import { artworkApplyMessage } from "./artworkApplyMessage";
import { capturePruneLeaseAdmission, isPruneLeaseCancellation } from "./pruneLease";
import { showToast } from "./toast";
import { detach } from "./detach";

export interface RefreshArtworkOptions {
  romId: number;
  appId: number;
  leaseOwner?: string;
  tag?: string;
  onNeedsPick?: (candidates: SgdbCandidate[]) => void;
}

export async function executeRefreshArtwork(options: RefreshArtworkOptions): Promise<void> {
  const { romId, appId, leaseOwner = `game-detail:${appId}`, tag = "handleRefreshArtwork", onNeedsPick } = options;
  const admission = capturePruneLeaseAdmission(leaseOwner);
  let coverFailure: string | null = null;
  const say = (sgdbResult: string) => {
    if (!coverFailure || coverFailure === sgdbResult) {
      showToast(sgdbResult);
      return;
    }
    showToast(`${sgdbResult.replace(/\.$/, "")}. The RomM cover could not be updated: ${coverFailure}`);
  };

  try {
    // Re-download the RomM cover, rename to {app_id}p.png, and patch
    // cover_path on the registry row so the game info panel can render the
    // refreshed image.
    const coverResult = await refreshCoverArtwork(romId).catch(
      (e): { success: boolean; reason?: WireReason | "exception"; message: string; cover_path?: string } => {
        detach(debugLog(`refreshCoverArtwork rejected: ${e}`));
        return { success: false, reason: "exception", message: "the request did not complete" };
      },
    );
    if (coverResult.success) {
      // Notify the game info panel so it can re-render the cover image.
      globalThis.dispatchEvent(
        new CustomEvent("romm_data_changed", {
          detail: { type: "cover_refreshed", rom_id: romId },
        }),
      );
    } else {
      detach(debugLog(`refreshCoverArtwork failed: ${coverResult.reason} — ${coverResult.message}`));
      coverFailure = coverResult.message;
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
        say(artworkApplyMessage(await applyArtwork(romId, appId)));
        break;
      }
      case "needs_pick":
        if (coverFailure) showToast(`The RomM cover could not be updated: ${coverFailure}`);
        if (onNeedsPick) {
          onNeedsPick(resolution.candidates);
        } else {
          say("Multiple SteamGridDB matches found");
        }
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
  }
}
