import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as backend from "../api/backend";
import { toaster } from "../api/host";
import type { DownloadItem } from "../types";
import {
  DOWNLOADS_EMPTY_LABEL,
  DOWNLOADS_SECTION_TITLE,
  formatFinishedDescription,
  useDownloadQueue,
} from "./downloadQueue";
import { getDownloadState, setDownloads } from "./downloadStore";

function makeItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    rom_id: 1,
    rom_name: "Test Game",
    platform_name: "Genesis",
    file_name: "test.bin",
    status: "downloading",
    progress: 50,
    bytes_downloaded: 512,
    total_bytes: 1024,
    resumable: false,
    ...overrides,
  };
}

async function flushMount(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("downloadQueue utils", () => {
  beforeEach(() => {
    setDownloads([]);
    vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [] });
    vi.mocked(backend.cancelDownload).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.pauseDownload).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.resumeDownload).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.clearCompletedDownloads).mockResolvedValue({ success: true, cleared: 0 });
    vi.mocked(toaster.toast).mockClear();
  });

  describe("constants & formatFinishedDescription", () => {
    it("exports standard empty label and section title", () => {
      expect(DOWNLOADS_EMPTY_LABEL).toBe("No downloads");
      expect(DOWNLOADS_SECTION_TITLE).toBe("Downloads");
    });

    it("formats completed download with byte size", () => {
      const item = makeItem({ status: "completed", total_bytes: 1024 * 1024 });
      expect(formatFinishedDescription(item)).toBe("Completed — 1.0 MB");
    });

    it("formats failed download with detail when error is provided", () => {
      const item = makeItem({ status: "failed", error: "Connection lost" });
      expect(formatFinishedDescription(item)).toBe("Failed: Connection lost");
    });

    it("formats failed download without detail when error is empty", () => {
      const item = makeItem({ status: "failed", error: "" });
      expect(formatFinishedDescription(item)).toBe("Failed");
    });

    it("formats cancelled download", () => {
      const item = makeItem({ status: "cancelled" });
      expect(formatFinishedDescription(item)).toBe("Cancelled");
    });
  });

  describe("useDownloadQueue", () => {
    it("seeds the store from getDownloadQueue on mount", async () => {
      const item = makeItem({ rom_id: 10, rom_name: "Seeded" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      expect(getDownloadState()).toEqual([item]);
      expect(result.current.downloads).toEqual([item]);
      expect(result.current.active).toEqual([item]);
      expect(result.current.finished).toEqual([]);
      expect(result.current.hasFinished).toBe(false);
      expect(result.current.isEmpty).toBe(false);
    });

    it("leaves existing store state on rejected mount fetch", async () => {
      const item = makeItem({ rom_id: 20, rom_name: "Pre-existing" });
      setDownloads([item]);
      vi.mocked(backend.getDownloadQueue).mockRejectedValue(new Error("network error"));

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      expect(getDownloadState()).toEqual([item]);
      expect(result.current.downloads).toEqual([item]);
    });

    it("partitions active and finished downloads accurately", async () => {
      const q = makeItem({ rom_id: 1, status: "queued" });
      const d = makeItem({ rom_id: 2, status: "downloading" });
      const p = makeItem({ rom_id: 3, status: "paused" });
      const x = makeItem({ rom_id: 4, status: "extracting" });
      const c = makeItem({ rom_id: 5, status: "completed" });
      const f = makeItem({ rom_id: 6, status: "failed" });
      const can = makeItem({ rom_id: 7, status: "cancelled" });

      vi.mocked(backend.getDownloadQueue).mockResolvedValue({
        downloads: [q, d, p, x, c, f, can],
      });

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      expect(result.current.active).toEqual([q, d, p, x]);
      expect(result.current.finished).toEqual([c, f, can]);
      expect(result.current.hasFinished).toBe(true);
      expect(result.current.isEmpty).toBe(false);
    });

    it("computes isEmpty as true when no downloads exist", async () => {
      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      expect(result.current.downloads).toEqual([]);
      expect(result.current.active).toEqual([]);
      expect(result.current.finished).toEqual([]);
      expect(result.current.hasFinished).toBe(false);
      expect(result.current.isEmpty).toBe(true);
    });

    it("handleCancel invokes backend cancelDownload and is silent on success", async () => {
      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleCancel(100);
      });

      expect(backend.cancelDownload).toHaveBeenCalledWith(100);
      expect(toaster.toast).not.toHaveBeenCalled();
    });

    it("handleCancel surfaces backend failure reason via toast", async () => {
      vi.mocked(backend.cancelDownload).mockResolvedValue({
        success: false,
        message: "ROM not found in queue",
      });

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleCancel(101);
      });

      expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "ROM not found in queue" }));
    });

    it("handleCancel surfaces fallback message when message is omitted", async () => {
      vi.mocked(backend.cancelDownload).mockResolvedValue({
        success: false,
        message: "",
      });

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleCancel(102);
      });

      expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Could not cancel the download" }));
    });

    it("handleCancel catches rejections and surfaces fallback toast", async () => {
      vi.mocked(backend.cancelDownload).mockRejectedValue(new Error("RPC failed"));

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleCancel(103);
      });

      expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Could not cancel the download" }));
    });

    it("handlePause calls pauseDownload and ignores rejections", async () => {
      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handlePause(200);
      });
      expect(backend.pauseDownload).toHaveBeenCalledWith(200);

      vi.mocked(backend.pauseDownload).mockRejectedValue(new Error("failed"));
      await act(async () => {
        await result.current.handlePause(201);
      });
      expect(backend.pauseDownload).toHaveBeenCalledWith(201);
    });

    it("handleResume calls resumeDownload and ignores rejections", async () => {
      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleResume(300);
      });
      expect(backend.resumeDownload).toHaveBeenCalledWith(300);

      vi.mocked(backend.resumeDownload).mockRejectedValue(new Error("failed"));
      await act(async () => {
        await result.current.handleResume(301);
      });
      expect(backend.resumeDownload).toHaveBeenCalledWith(301);
    });

    it("handleClearCompleted calls clearCompletedDownloads and removes terminal downloads from store on success", async () => {
      const active = makeItem({ rom_id: 1, status: "downloading" });
      const completed = makeItem({ rom_id: 2, status: "completed" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [active, completed] });

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleClearCompleted();
      });

      expect(backend.clearCompletedDownloads).toHaveBeenCalled();
      expect(getDownloadState()).toEqual([active]);
      expect(result.current.downloads).toEqual([active]);
    });

    it("handleClearCompleted does not remove terminal downloads if clear call throws", async () => {
      const completed = makeItem({ rom_id: 2, status: "completed" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [completed] });
      vi.mocked(backend.clearCompletedDownloads).mockRejectedValue(new Error("clear failed"));

      const { result } = renderHook(() => useDownloadQueue());
      await flushMount();

      await act(async () => {
        await result.current.handleClearCompleted();
      });

      expect(backend.clearCompletedDownloads).toHaveBeenCalled();
      expect(getDownloadState()).toEqual([completed]);
      expect(result.current.downloads).toEqual([completed]);
    });
  });
});
