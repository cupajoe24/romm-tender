import { describe, it, expect, beforeEach, vi } from "vitest";
import * as backend from "../api/backend";
import * as artwork from "./artwork";
import * as toast from "./toast";
import { executeSgdbCandidateSearch, executeSgdbSelectionApply } from "./sgdbGamePicker";
import {
  SGDB_PICKER_NO_MATCHES,
  SGDB_PICKER_GENERIC_SEARCH_ERROR,
  SGDB_PICKER_APPLY_FAILED,
} from "./sgdbPickerWording";

vi.mock("./artwork", () => ({
  applyArtwork: vi.fn(),
}));

vi.mock("./toast", () => ({
  showToast: vi.fn(),
}));

describe("sgdbGamePicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(artwork.applyArtwork).mockResolvedValue(4);
    vi.mocked(backend.applySgdbGameId).mockResolvedValue({ success: true });
    vi.mocked(backend.searchSgdbGames).mockResolvedValue({ success: true, games: [] });
    vi.mocked(backend.debugLog).mockResolvedValue(undefined);
  });

  describe("executeSgdbCandidateSearch", () => {
    it("returns candidate games on successful search with results", async () => {
      const candidates: backend.SgdbCandidate[] = [
        { id: 1, name: "Super Mario Bros.", release_year: 1985, thumb_url: "https://x/mario.png" },
      ];
      vi.mocked(backend.searchSgdbGames).mockResolvedValue({ success: true, games: candidates });

      const result = await executeSgdbCandidateSearch("Mario");
      expect(result).toEqual({ success: true, games: candidates });
      expect(backend.searchSgdbGames).toHaveBeenCalledWith("Mario");
    });

    it("returns NO_MATCHES error when search succeeds with zero games", async () => {
      vi.mocked(backend.searchSgdbGames).mockResolvedValue({ success: true, games: [] });

      const result = await executeSgdbCandidateSearch("Nonexistent");
      expect(result).toEqual({ success: false, games: [], error: SGDB_PICKER_NO_MATCHES });
    });

    it("returns backend error message when search response is unsuccessful", async () => {
      vi.mocked(backend.searchSgdbGames).mockResolvedValue({
        success: false,
        reason: "server_unreachable",
        message: "Could not reach SteamGridDB",
      });

      const result = await executeSgdbCandidateSearch("Zelda");
      expect(result).toEqual({ success: false, games: [], error: "Could not reach SteamGridDB" });
    });

    it("catches network rejection, logs debugLog, and returns generic error", async () => {
      vi.mocked(backend.searchSgdbGames).mockRejectedValue(new Error("network failure"));

      const result = await executeSgdbCandidateSearch("Metroid", { tag: "CustomTag" });
      expect(result).toEqual({ success: false, games: [], error: SGDB_PICKER_GENERIC_SEARCH_ERROR });
      expect(backend.debugLog).toHaveBeenCalledWith(
        expect.stringContaining("CustomTag: searchSgdbGames rejected: Error: network failure"),
      );
    });
  });

  describe("executeSgdbSelectionApply", () => {
    it("persists game ID, applies artwork, toasts count, and reports onApplied", async () => {
      const onApplied = vi.fn();
      const outcome = await executeSgdbSelectionApply({
        romId: 42,
        appId: 1000,
        selectedId: 777,
        onApplied,
      });

      expect(backend.applySgdbGameId).toHaveBeenCalledWith(42, 777);
      expect(artwork.applyArtwork).toHaveBeenCalledWith(42, 1000);
      expect(toast.showToast).toHaveBeenCalledWith("Artwork refreshed (4/4 images applied)");
      expect(onApplied).toHaveBeenCalledWith(4);
      expect(outcome).toEqual({ success: true, applied: 4 });
    });

    it("toasts failure message and stops when applySgdbGameId returns endpoint failure", async () => {
      const onApplied = vi.fn();
      vi.mocked(backend.applySgdbGameId).mockResolvedValue({
        success: false,
        reason: "prune_active",
        message: "Cleanup in progress",
      });

      const outcome = await executeSgdbSelectionApply({
        romId: 42,
        appId: 1000,
        selectedId: 777,
        onApplied,
      });

      expect(toast.showToast).toHaveBeenCalledWith("Cleanup in progress");
      expect(artwork.applyArtwork).not.toHaveBeenCalled();
      expect(onApplied).not.toHaveBeenCalled();
      expect(outcome).toEqual({ success: false });
    });

    it("catches applySgdbGameId rejection, logs debugLog, toasts error, and stops", async () => {
      const onApplied = vi.fn();
      vi.mocked(backend.applySgdbGameId).mockRejectedValue(new Error("disk error"));

      const outcome = await executeSgdbSelectionApply({
        romId: 42,
        appId: 1000,
        selectedId: 777,
        onApplied,
        tag: "TestTag",
      });

      expect(backend.debugLog).toHaveBeenCalledWith(
        expect.stringContaining("TestTag: applySgdbGameId rejected: Error: disk error"),
      );
      expect(toast.showToast).toHaveBeenCalledWith(SGDB_PICKER_APPLY_FAILED);
      expect(artwork.applyArtwork).not.toHaveBeenCalled();
      expect(onApplied).not.toHaveBeenCalled();
      expect(outcome).toEqual({ success: false });
    });

    it("catches applyArtwork rejection, logs debugLog, and treats as 0 applied", async () => {
      const onApplied = vi.fn();
      vi.mocked(artwork.applyArtwork).mockRejectedValue(new Error("artwork error"));

      const outcome = await executeSgdbSelectionApply({
        romId: 42,
        appId: 1000,
        selectedId: 777,
        onApplied,
        tag: "TestTag",
      });

      expect(backend.debugLog).toHaveBeenCalledWith(
        expect.stringContaining("TestTag: applyArtwork rejected: Error: artwork error"),
      );
      expect(toast.showToast).toHaveBeenCalledWith("No artwork available for this game");
      expect(onApplied).toHaveBeenCalledWith(0);
      expect(outcome).toEqual({ success: true, applied: 0 });
    });

    it("handles applyArtwork returning -1 (missing API key toast)", async () => {
      const onApplied = vi.fn();
      vi.mocked(artwork.applyArtwork).mockResolvedValue(-1);

      const outcome = await executeSgdbSelectionApply({
        romId: 42,
        appId: 1000,
        selectedId: 777,
        onApplied,
      });

      expect(toast.showToast).toHaveBeenCalledWith("Set a SteamGridDB API key in Settings first");
      expect(onApplied).toHaveBeenCalledWith(-1);
      expect(outcome).toEqual({ success: true, applied: -1 });
    });
  });
});
