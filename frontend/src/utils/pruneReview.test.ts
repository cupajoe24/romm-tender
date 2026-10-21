import { describe, expect, it, vi, beforeEach } from "vitest";
import * as backend from "../api/backend";
import {
  finishedGroupsPercent,
  loadRemainingPages,
  requestFor,
  requestPruneCancel,
  stageInstalledSelections,
  type PageLoadSink,
} from "./pruneReview";

vi.mock("../api/backend", () => ({
  cancelPrune: vi.fn(),
  getPrunePreview: vi.fn(),
  stagePruneInstalledSelection: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

describe("pruneReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("finishedGroupsPercent", () => {
    it("calculates clamped percentage of completed groups", () => {
      expect(finishedGroupsPercent(1, 1)).toBe(0);
      expect(finishedGroupsPercent(2, 2)).toBe(50);
      expect(finishedGroupsPercent(3, 4)).toBe(50);
      expect(finishedGroupsPercent(5, 4)).toBe(100);
      expect(finishedGroupsPercent(0, 4)).toBe(0);
    });
  });

  describe("requestFor", () => {
    it("creates a prune preview request object", () => {
      const req = requestFor("bulk", null, "prev-1", 50);
      expect(req).toEqual({
        scope: "bulk",
        rom_id: null,
        preview_id: "prev-1",
        offset: 50,
        limit: 50,
      });
    });
  });

  describe("loadRemainingPages", () => {
    it("fetches pages until total is reached and signals allArrived", async () => {
      const item1: backend.PrunePreviewItem = {
        rom_id: 2,
        name: "Game 2",
        fs_name: "Game 2.gba",
        fs_name_no_ext: "Game 2",
        group_id: "g2",
        group_size: 1,
        bound_count: 0,
        bound: false,
        is_main_sibling: false,
        candidate: true,
        gone_from_romm: true,
        platform_slug: "gba",
        installed: false,
        installed_bytes: null,
        warning: null,
      };

      vi.mocked(backend.getPrunePreview).mockResolvedValueOnce({
        success: true,
        items: [item1],
        total: 2,
        free_bytes: 4096,
      });

      const addedRows: backend.PrunePreviewItem[][] = [];
      let allArrivedCalled = false;

      const sink: PageLoadSink = {
        isCurrent: () => true,
        addRows: (rows) => addedRows.push(rows),
        fail: vi.fn(),
        allArrived: () => {
          allArrivedCalled = true;
        },
      };

      await loadRemainingPages({ scope: "bulk", romId: null, previewId: "prev-1", total: 2 }, 1, sink);

      expect(addedRows).toHaveLength(1);
      expect(addedRows[0]).toEqual([item1]);
      expect(allArrivedCalled).toBe(true);
      expect(sink.fail).not.toHaveBeenCalled();
    });

    it("stops and reports failure if page fetch fails", async () => {
      vi.mocked(backend.getPrunePreview).mockResolvedValueOnce({
        success: false,
        message: "Server disk error",
      });

      let failedMessage = "";
      const sink: PageLoadSink = {
        isCurrent: () => true,
        addRows: vi.fn(),
        fail: (msg) => {
          failedMessage = msg;
        },
        allArrived: vi.fn(),
      };

      await loadRemainingPages({ scope: "bulk", romId: null, previewId: "prev-1", total: 5 }, 1, sink);

      expect(failedMessage).toBe("Server disk error");
      expect(sink.allArrived).not.toHaveBeenCalled();
    });

    it("stops if list ends before total arrived", async () => {
      vi.mocked(backend.getPrunePreview).mockResolvedValueOnce({
        success: true,
        items: [],
        total: 5,
      });

      let failedMessage = "";
      const sink: PageLoadSink = {
        isCurrent: () => true,
        addRows: vi.fn(),
        fail: (msg) => {
          failedMessage = msg;
        },
        allArrived: vi.fn(),
      };

      await loadRemainingPages({ scope: "bulk", romId: null, previewId: "prev-1", total: 5 }, 1, sink);

      expect(failedMessage).toContain("ended before every entry arrived");
      expect(sink.allArrived).not.toHaveBeenCalled();
    });
  });

  describe("stageInstalledSelections", () => {
    it("chunks selections into pages and stages with final flag", async () => {
      const selections = Array.from({ length: 150 }, (_, i) => i + 1);
      vi.mocked(backend.stagePruneInstalledSelection)
        .mockResolvedValueOnce({ success: true, selection_id: "sel-chunk-1" })
        .mockResolvedValueOnce({ success: true, selection_id: "sel-chunk-2" });

      const setStatus = vi.fn();
      const res = await stageInstalledSelections("prev-1", selections, setStatus);

      expect(res).toEqual({ ok: true, selectionId: "sel-chunk-2" });
      expect(backend.stagePruneInstalledSelection).toHaveBeenCalledTimes(2);
      expect(backend.stagePruneInstalledSelection).toHaveBeenNthCalledWith(1, {
        preview_id: "prev-1",
        selection_id: null,
        rom_ids: selections.slice(0, 100),
        final: false,
      });
      expect(backend.stagePruneInstalledSelection).toHaveBeenNthCalledWith(2, {
        preview_id: "prev-1",
        selection_id: "sel-chunk-1",
        rom_ids: selections.slice(100),
        final: true,
      });
    });

    it("returns ok: false on staging error", async () => {
      vi.mocked(backend.stagePruneInstalledSelection).mockResolvedValueOnce({
        success: false,
        message: "Staging database locked",
      });

      const setStatus = vi.fn();
      const res = await stageInstalledSelections("prev-1", [1, 2], setStatus);

      expect(res).toEqual({ ok: false });
      expect(setStatus).toHaveBeenCalledWith("Staging database locked");
    });
  });

  describe("requestPruneCancel", () => {
    it("returns null on successful cancel request", async () => {
      vi.mocked(backend.cancelPrune).mockResolvedValueOnce({ success: true, message: "Prune cancelled" });
      const res = await requestPruneCancel("run-1");
      expect(res).toBeNull();
    });

    it("returns message on refused cancel", async () => {
      vi.mocked(backend.cancelPrune).mockResolvedValueOnce({
        success: false,
        reason: "cancelled",
        message: "Run already ended",
      });
      const res = await requestPruneCancel("run-1");
      expect(res).toBe("Run already ended");
    });

    it("handles exception thrown during cancel", async () => {
      vi.mocked(backend.cancelPrune).mockRejectedValueOnce(new Error("Network timeout"));
      const res = await requestPruneCancel("run-1");
      expect(res).toContain("Could not request cancellation: Error: Network timeout");
    });
  });
});
