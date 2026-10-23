/**
 * Operations for SteamGridDB manual game candidate search and artwork apply.
 * Shared between Big Picture's SgdbGamePickerModal and the desktop surface's
 * DesktopSgdbGamePickerDialog.
 */

import {
  searchSgdbGames,
  applySgdbGameId,
  debugLog,
  isEndpointFailure,
  type EndpointFailure,
  type SgdbCandidate,
} from "../api/backend";
import { applyArtwork } from "./artwork";
import { artworkApplyMessage } from "./artworkApplyMessage";
import { showToast } from "./toast";
import { detach } from "./detach";
import {
  SGDB_PICKER_NO_MATCHES,
  SGDB_PICKER_GENERIC_SEARCH_ERROR,
  SGDB_PICKER_APPLY_FAILED,
} from "./sgdbPickerWording";

export type SgdbCandidateSearchResult =
  { success: true; games: SgdbCandidate[]; error?: undefined } | { success: false; games: []; error: string };

export interface SgdbCandidateSearchOptions {
  tag?: string;
}

/**
 * Searches SteamGridDB by title and enriches candidates. Answers the candidate
 * list on success, or an error message to display when no candidates match or
 * the search request failed.
 */
export async function executeSgdbCandidateSearch(
  term: string,
  options?: SgdbCandidateSearchOptions,
): Promise<SgdbCandidateSearchResult> {
  const tag = options?.tag ?? "SgdbGamePicker";
  const res = await searchSgdbGames(term).catch((e): null => {
    detach(debugLog(`${tag}: searchSgdbGames rejected: ${e}`));
    return null;
  });
  if (res?.success) {
    if (res.games.length === 0) {
      return { success: false, games: [], error: SGDB_PICKER_NO_MATCHES };
    }
    return { success: true, games: res.games };
  }
  return {
    success: false,
    games: [],
    error: res?.message ?? SGDB_PICKER_GENERIC_SEARCH_ERROR,
  };
}

export interface SgdbSelectionApplyOptions {
  romId: number;
  appId: number;
  selectedId: number;
  onApplied?: (applied: number | EndpointFailure) => void;
  tag?: string;
}

/**
 * Persists the user's manual SGDB game choice, downloads the four SGDB asset
 * types, writes them onto the Steam shortcut, and toasts the outcome.
 */
export async function executeSgdbSelectionApply(
  options: SgdbSelectionApplyOptions,
): Promise<{ success: boolean; applied?: number | EndpointFailure }> {
  const { romId, appId, selectedId, onApplied, tag = "SgdbGamePicker" } = options;
  const result = await applySgdbGameId(romId, selectedId).catch((e): null => {
    detach(debugLog(`${tag}: applySgdbGameId rejected: ${e}`));
    return null;
  });
  if (!result) {
    showToast(SGDB_PICKER_APPLY_FAILED);
    return { success: false };
  }
  if (isEndpointFailure(result)) {
    showToast(result.message);
    return { success: false };
  }
  const applied = await applyArtwork(romId, appId).catch((e): number => {
    detach(debugLog(`${tag}: applyArtwork rejected: ${e}`));
    return 0;
  });
  showToast(artworkApplyMessage(applied));
  onApplied?.(applied);
  return { success: true, applied };
}
