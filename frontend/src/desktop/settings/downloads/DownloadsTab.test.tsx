import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as backend from "../../../api/backend";
import { toaster } from "../../../api/host";
import { getDownloadState, setDownloads } from "../../../utils/downloadStore";
import type { DownloadItem } from "../../../types";
import { DownloadsTab } from "./DownloadsTab";

function makeItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    rom_id: 1,
    rom_name: "Super Mario World",
    platform_name: "SNES",
    file_name: "smw.sfc",
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

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(text));
  return (btn as HTMLButtonElement | undefined) ?? null;
}

function buttonByExactText(container: HTMLElement, text: string): HTMLButtonElement | null {
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text);
  return (btn as HTMLButtonElement | undefined) ?? null;
}

describe("DownloadsTab (desktop)", () => {
  beforeEach(() => {
    setDownloads([]);
    vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [] });
    vi.mocked(backend.cancelDownload).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.pauseDownload).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.resumeDownload).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.clearCompletedDownloads).mockResolvedValue({ success: true, cleared: 0 });
    vi.mocked(toaster.toast).mockClear();
  });

  describe("mount & empty state", () => {
    it("renders the downloads tab container and empty queue state when empty", async () => {
      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(container.querySelector('[data-testid="tender-settings-downloads"]')).not.toBeNull();
      const emptyCard = container.querySelector('[data-testid="downloads-empty"]');
      expect(emptyCard).not.toBeNull();
      expect(emptyCard?.textContent).toContain("No downloads");
      expect(emptyCard?.textContent).toContain("There are no downloads in progress or queued.");
      expect(container.querySelector('[data-testid="downloads-active-list"]')).toBeNull();
      expect(container.querySelector('[data-testid="downloads-finished-section"]')).toBeNull();
    });

    it("seeds the queue from getDownloadQueue on mount", async () => {
      const item = makeItem({ rom_id: 10, rom_name: "Chrono Trigger" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(getDownloadState()).toEqual([item]);
      expect(container.querySelector('[data-testid="downloads-empty"]')).toBeNull();
      expect(container.querySelector('[data-testid="downloads-active-list"]')).not.toBeNull();
      expect(container.textContent).toContain("Chrono Trigger");
    });
  });

  describe("active downloads", () => {
    it("renders active downloading items with progress bar and byte counts", async () => {
      const item = makeItem({
        rom_id: 11,
        rom_name: "Metroid",
        platform_name: "NES",
        bytes_downloaded: 256,
        total_bytes: 1024,
      });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      const caption = container.querySelector('[data-testid="dl-caption"]');
      expect(caption?.textContent).toBe("Metroid (NES)");

      const bytes = container.querySelector('[data-testid="dl-bytes"]');
      expect(bytes?.textContent).toBe("256 B / 1.0 KB");

      const progress = container.querySelector('[data-testid="progress-progress"]');
      expect(progress?.textContent).toBe("25");
      const indeterminate = container.querySelector('[data-testid="progress-indeterminate"]');
      expect(indeterminate?.textContent).toBe("false");
    });

    it("renders indeterminate progress bar when total_bytes is 0", async () => {
      const item = makeItem({
        rom_id: 12,
        rom_name: "Castlevania",
        bytes_downloaded: 500,
        total_bytes: 0,
      });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      const indeterminate = container.querySelector('[data-testid="progress-indeterminate"]');
      expect(indeterminate?.textContent).toBe("true");

      const bytes = container.querySelector('[data-testid="dl-bytes"]');
      expect(bytes?.textContent).toBe("500 B");
    });

    it("renders Pause button for downloading + resumable items and calls pauseDownload", async () => {
      const item = makeItem({
        rom_id: 13,
        rom_name: "Sonic",
        status: "downloading",
        resumable: true,
      });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      const pauseBtn = buttonByText(container, "Pause Sonic");
      expect(pauseBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(pauseBtn!);
        await Promise.resolve();
      });

      expect(backend.pauseDownload).toHaveBeenCalledWith(13);
    });

    it("does not render Pause button for downloading + non-resumable items", async () => {
      const item = makeItem({
        rom_id: 14,
        rom_name: "Zelda",
        status: "downloading",
        resumable: false,
      });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(buttonByText(container, "Pause Zelda")).toBeNull();
      expect(buttonByText(container, "Cancel Zelda")).not.toBeNull();
    });

    it("renders Resume button for paused items and displays Paused status caption", async () => {
      const item = makeItem({
        rom_id: 15,
        rom_name: "Donkey Kong",
        status: "paused",
        resumable: true,
      });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(container.querySelector('[data-testid="dl-caption"]')?.textContent).toContain(
        "Donkey Kong (SNES) — Paused",
      );
      const resumeBtn = buttonByText(container, "Resume Donkey Kong");
      expect(resumeBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(resumeBtn!);
        await Promise.resolve();
      });

      expect(backend.resumeDownload).toHaveBeenCalledWith(15);
    });

    it("renders no action buttons for extracting items", async () => {
      const item = makeItem({
        rom_id: 16,
        rom_name: "Pokemon",
        status: "extracting",
      });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(container.querySelector('[data-testid="dl-caption"]')?.textContent).toContain(
        "Pokemon (SNES) — Extracting…",
      );
      expect(buttonByText(container, "Pause Pokemon")).toBeNull();
      expect(buttonByText(container, "Resume Pokemon")).toBeNull();
      expect(buttonByText(container, "Cancel Pokemon")).toBeNull();
    });

    it("clicking Cancel button calls cancelDownload and is silent on success", async () => {
      const item = makeItem({ rom_id: 17, rom_name: "Kirby" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      const cancelBtn = buttonByText(container, "Cancel Kirby");
      expect(cancelBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(cancelBtn!);
        await Promise.resolve();
      });

      expect(backend.cancelDownload).toHaveBeenCalledWith(17);
      expect(toaster.toast).not.toHaveBeenCalled();
    });

    it("surfaces failure toast when cancelDownload fails", async () => {
      const item = makeItem({ rom_id: 18, rom_name: "Failing Cancel" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [item] });
      vi.mocked(backend.cancelDownload).mockResolvedValue({
        success: false,
        message: "Download already finished",
      });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      await act(async () => {
        fireEvent.click(buttonByText(container, "Cancel Failing Cancel")!);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Download already finished" }));
    });
  });

  describe("finished downloads", () => {
    it("renders completed, failed, and cancelled downloads with descriptions", async () => {
      const completed = makeItem({
        rom_id: 21,
        rom_name: "Game Completed",
        status: "completed",
        total_bytes: 2048,
      });
      const failed = makeItem({
        rom_id: 22,
        rom_name: "Game Failed",
        status: "failed",
        error: "Server timeout",
      });
      const cancelled = makeItem({
        rom_id: 23,
        rom_name: "Game Cancelled",
        status: "cancelled",
      });

      vi.mocked(backend.getDownloadQueue).mockResolvedValue({
        downloads: [completed, failed, cancelled],
      });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      const finishedSection = container.querySelector('[data-testid="downloads-finished-section"]');
      expect(finishedSection).not.toBeNull();
      expect(finishedSection?.textContent).toContain("Completed Downloads");

      expect(container.textContent).toContain("Game Completed");
      expect(container.textContent).toContain("Completed — 2.0 KB");

      expect(container.textContent).toContain("Game Failed");
      expect(container.textContent).toContain("Failed: Server timeout");

      expect(container.textContent).toContain("Game Cancelled");
      expect(container.textContent).toContain("Cancelled");

      expect(buttonByExactText(container, "Clear Completed")).not.toBeNull();
    });

    it("Clear Completed button invokes clearCompletedDownloads and evicts finished items from store", async () => {
      const active = makeItem({ rom_id: 31, status: "downloading" });
      const completed = makeItem({ rom_id: 32, rom_name: "Finished Item", status: "completed" });

      vi.mocked(backend.getDownloadQueue).mockResolvedValue({
        downloads: [active, completed],
      });

      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(container.textContent).toContain("Finished Item");
      const clearBtn = buttonByExactText(container, "Clear Completed");
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(clearBtn!);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(backend.clearCompletedDownloads).toHaveBeenCalled();
      expect(container.textContent).not.toContain("Finished Item");
      expect(container.querySelector('[data-testid="downloads-finished-section"]')).toBeNull();
      expect(getDownloadState()).toEqual([active]);
    });

    it("Clear Completed failure preserves finished items in place", async () => {
      const completed = makeItem({ rom_id: 33, rom_name: "Preserved Item", status: "completed" });
      vi.mocked(backend.getDownloadQueue).mockResolvedValue({ downloads: [completed] });
      vi.mocked(backend.clearCompletedDownloads).mockRejectedValue(new Error("network failure"));

      const { container } = render(<DownloadsTab />);
      await flushMount();

      const clearBtn = buttonByExactText(container, "Clear Completed");
      await act(async () => {
        fireEvent.click(clearBtn!);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).toContain("Preserved Item");
      expect(getDownloadState()).toEqual([completed]);
    });
  });

  describe("store reactivity", () => {
    it("reflects external store additions dynamically", async () => {
      const { container } = render(<DownloadsTab />);
      await flushMount();

      expect(container.textContent).toContain("No downloads");

      await act(async () => {
        setDownloads([makeItem({ rom_id: 50, rom_name: "Live Game" })]);
      });

      expect(container.textContent).not.toContain("No downloads");
      expect(container.textContent).toContain("Live Game");
    });
  });
});
