/**
 * discSelection.tsx — Shared multi-disc selection logic, tokens, and visual glyphs (#865).
 *
 * Provides:
 *   - Visual tokens (DISC_GREY, DISC_ACCENT) and glyph components (DiscStack, DiscWithNumber).
 *   - Multi-disc state evaluation (computeDiscDisplayState).
 *   - Menu option building (buildDiscOptions).
 *   - Fetching disc selection (fetchDiscSelection).
 *   - Executing disc selection with prune lease coordination (executeDiscSelection).
 */

import { createElement, type FC, type ReactNode } from "react";
import { FaCompactDisc } from "react-icons/fa";
import { getDiscSelection, selectDisc, logError, logWarn } from "../api/backend";
import type { DiscSelection } from "../api/backend";
import { setLaunchOptionsConfirmed } from "./steamShortcuts";
import { showToast } from "./toast";
import { capturePruneLeaseAdmission, isPruneLeaseCancellation, withPruneLease } from "./pruneLease";

/** A disc option's data value: a disc filename, or null for the m3u default. */
export type DiscOptionData = string | null;

// Neutral grey for the m3u default; Steam accent blue when a specific disc is
// pinned — an instant "this isn't the default" read.
export const DISC_GREY = "#dcdedf";
export const DISC_ACCENT = "#59b6ff";

/**
 * Two CDs stacked top-left -> bottom-right: the front (opaque) disc at the
 * top-left, one behind it trailing down-right and faded — the m3u "all discs"
 * face. The back disc renders first so the front one is on top.
 */
export const DiscStack: FC<{ size: number; color: string }> = ({ size, color }) => {
  const step = Math.round(size * 0.3);
  return (
    <span style={{ position: "relative", display: "inline-block", width: size + step, height: size + step, color }}>
      <FaCompactDisc size={size} style={{ position: "absolute", left: step, top: step, opacity: 0.55 }} />
      <FaCompactDisc size={size} style={{ position: "absolute", left: 0, top: 0, opacity: 1 }} />
    </span>
  );
};

/** One CD + its number — the "Disc N" face. */
export const DiscWithNumber: FC<{ size: number; color: string; num: string }> = ({ size, color, num }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color }}>
    <FaCompactDisc size={size} />
    {num ? <span style={{ fontWeight: 600, fontSize: `${Math.round(size * 0.6)}px` }}>{num}</span> : null}
  </span>
);

export interface DiscDisplayState {
  isM3u: boolean;
  effectiveSelected: DiscOptionData;
  isPinned: boolean;
  showPlaylistFace: boolean;
  activeNum: string;
}

/**
 * Derives the effective disc selection, playlist state, pin state, and active disc number
 * from the backend selection response and locally tracked pin.
 * Returns null if the selection is not multi-disc or lacks required metadata.
 */
export function computeDiscDisplayState(
  selection: DiscSelection | null | undefined,
  selected: DiscOptionData,
): DiscDisplayState | null {
  if (!selection?.multi_disc || !selection.discs || !selection.default) return null;

  const { discs, default: dflt } = selection;
  const isM3u = dflt.kind === "m3u";
  const effectiveSelected: DiscOptionData = selected ?? (isM3u ? null : dflt.filename);
  const isPinned = selected !== null;
  const showPlaylistFace = isM3u && selected === null;
  const activeDisc = discs.find((d) => d.filename === effectiveSelected);
  const activeNum = activeDisc ? (activeDisc.label.match(/\d+/)?.[0] ?? String(activeDisc.index)) : "";

  return {
    isM3u,
    effectiveSelected,
    isPinned,
    showPlaylistFace,
    activeNum,
  };
}

export interface DiscOptionItem {
  data: DiscOptionData;
  icon: ReactNode;
  text: string;
}

/**
 * Builds the list of selectable disc options: the m3u "all discs" entry (when m3u default
 * is present) followed by each disc in the set.
 */
export function buildDiscOptions(selection: DiscSelection): DiscOptionItem[] {
  if (!selection.discs || !selection.default) return [];

  const { discs, default: dflt } = selection;
  const isM3u = dflt.kind === "m3u";
  const options: DiscOptionItem[] = [];

  if (isM3u) {
    options.push({
      data: null,
      icon: createElement(DiscStack, { size: 16, color: DISC_GREY }),
      text: dflt.label,
    });
  }

  for (const disc of discs) {
    options.push({
      data: disc.filename,
      icon: createElement(FaCompactDisc, { size: 16 }),
      text: disc.label,
    });
  }

  return options;
}

/**
 * Queries disc selection metadata for the given ROM id.
 */
export async function fetchDiscSelection(romId: number, logTag = "DiscSelector"): Promise<DiscSelection | null> {
  try {
    return await getDiscSelection(romId);
  } catch (e) {
    logError(`${logTag}: getDiscSelection failed: ${e}`);
    return null;
  }
}

export interface ExecuteDiscSelectionParams {
  appId: number;
  romId: number;
  data: DiscOptionData;
  leaseOwner: string;
  onSelected?: (selected: DiscOptionData) => void;
  logTag?: string;
}

/**
 * Executes a disc selection change with prune lease protection.
 *
 * If backend selection succeeds:
 * - Reconciles re-baked launch options if provided.
 * - Confirms with SteamClient shortcuts.
 * - Invokes `onSelected` with the updated selected disc.
 *
 * If backend selection fails or is cancelled:
 * - Prune lease cancellations are logged as warnings and suppressed.
 * - Unexpected errors and failure reasons surface a user toast.
 */
export async function executeDiscSelection({
  appId,
  romId,
  data,
  leaseOwner,
  onSelected,
  logTag = "DiscSelector",
}: ExecuteDiscSelectionParams): Promise<boolean> {
  const admission = capturePruneLeaseAdmission(leaseOwner);
  try {
    const result = await selectDisc(romId, data);
    return await withPruneLease(
      result.prune_lease_token,
      logTag,
      async (signal) => {
        if (result.success) {
          if (result.launch_options !== undefined) {
            if (signal.aborted) return false;
            await setLaunchOptionsConfirmed(appId, result.launch_options);
          }
          if (signal.aborted) return false;
          onSelected?.(result.selected ?? null);
          return true;
        } else {
          showToast(result.message || "Failed to select disc");
          return false;
        }
      },
      leaseOwner,
      admission,
    );
  } catch (e) {
    // Leaving the game page cancels the pick's continuation — the disc is
    // already persisted backend-side, so that is teardown and not a failure.
    if (isPruneLeaseCancellation(e, admission)) {
      logWarn(`${logTag}: disc selection continuation was cancelled: ${e}`);
      return false;
    }
    // Observable catch effect: surface the failure so the user knows the pick
    // didn't take, and leave `selected` unchanged (revert to the prior pin).
    logError(`${logTag}: selectDisc failed: ${e}`);
    showToast("Failed to select disc");
    return false;
  }
}
