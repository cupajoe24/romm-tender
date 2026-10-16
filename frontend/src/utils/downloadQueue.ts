/**
 * Shared download queue state, seed lifecycle, and action handlers.
 *
 * Drawn by both Big Picture (`bigpicture/DownloadQueue.tsx`) and Desktop
 * Settings (`desktop/settings/downloads/DownloadsTab.tsx`).
 */

import { useEffect } from "react";
import {
  getDownloadQueue,
  cancelDownload,
  pauseDownload,
  resumeDownload,
  clearCompletedDownloads,
} from "../api/backend";
import type { DownloadItem } from "../types";
import { detach } from "./detach";
import { formatBytes } from "./formatters";
import { setDownloads, removeTerminalDownloads, useDownloads } from "./downloadStore";
import { showToast } from "./toast";

export const DOWNLOADS_EMPTY_LABEL = "No downloads";
export const DOWNLOADS_SECTION_TITLE = "Downloads";

/**
 * Format a finished (terminal) download's status summary description.
 */
export function formatFinishedDescription(item: DownloadItem): string {
  if (item.status === "completed") return `Completed — ${formatBytes(item.total_bytes)}`;
  if (item.status === "failed") {
    const detail = item.error ? `: ${item.error}` : "";
    return `Failed${detail}`;
  }
  return "Cancelled";
}

export interface UseDownloadQueueResult {
  readonly downloads: readonly DownloadItem[];
  readonly active: readonly DownloadItem[];
  readonly finished: readonly DownloadItem[];
  readonly hasFinished: boolean;
  readonly isEmpty: boolean;
  handleCancel: (romId: number) => Promise<void>;
  handlePause: (romId: number) => Promise<void>;
  handleResume: (romId: number) => Promise<void>;
  handleClearCompleted: () => Promise<void>;
}

export function useDownloadQueue(): UseDownloadQueueResult {
  const downloads = useDownloads();

  useEffect(() => {
    // Seed the store from the backend queue on mount; the subscription renders
    // whatever lands there. A rejected fetch needs no handling of its own — the
    // store keeps whatever the event listeners have already put in it, and that
    // is exactly what stays on screen.
    detach(
      getDownloadQueue().then((result) => {
        setDownloads(result.downloads);
      }),
    );
  }, []);

  const handleCancel = async (romId: number): Promise<void> => {
    // A successful cancel (running OR paused) drops the row via the backend's
    // terminal cancelled frame → store listener. A cancel that could not act
    // (the entry vanished between render and click) returns the failure shape —
    // surface it so the click is never a silent no-op (#149 downloads-round).
    try {
      const result = await cancelDownload(romId);
      if (!result.success) {
        showToast(result.message || "Could not cancel the download");
      }
    } catch {
      showToast("Could not cancel the download");
    }
  };

  const handlePause = async (romId: number): Promise<void> => {
    try {
      await pauseDownload(romId);
    } catch {
      // ignore
    }
  };

  const handleResume = async (romId: number): Promise<void> => {
    try {
      await resumeDownload(romId);
    } catch {
      // ignore
    }
  };

  const handleClearCompleted = async (): Promise<void> => {
    try {
      await clearCompletedDownloads();
    } catch {
      // Clear failed (bridge/backend error) — leave the finished rows in place
      // so the list stays honest rather than hiding entries the backend kept.
      return;
    }
    // The backend evicted the terminal entries; drop them from the store too so
    // this view and any remount reflect the cleared queue immediately (#149).
    removeTerminalDownloads();
  };

  // Paused and extracting downloads stay in the active section — they're not
  // finished. Paused holds the partial transfer for resume; extracting is the
  // post-transfer ZIP unpack (not cancellable, no pause/resume offered).
  const active = downloads.filter(
    (d) => d.status === "queued" || d.status === "downloading" || d.status === "paused" || d.status === "extracting",
  );
  const finished = downloads.filter(
    (d) => d.status === "completed" || d.status === "failed" || d.status === "cancelled",
  );
  const hasFinished = finished.length > 0;
  const isEmpty = downloads.length === 0;

  return {
    downloads,
    active,
    finished,
    hasFinished,
    isEmpty,
    handleCancel,
    handlePause,
    handleResume,
    handleClearCompleted,
  };
}
