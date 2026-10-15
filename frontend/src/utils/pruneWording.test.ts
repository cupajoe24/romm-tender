import { describe, expect, it } from "vitest";
import {
  confirmBlockedReason,
  confirmButtonLabel,
  formatBinaryBytes,
  omittedWarnings,
  plural,
  removedInGroup,
  scanButtonDescription,
  stageLabel,
  verdictFor,
  versionLine,
  completionDescription,
} from "./pruneWording";
import type { PrunePreviewItem } from "../api/backend";
import type { PruneComplete, PruneGroupResult } from "./pruneStore";

describe("pruneWording", () => {
  it("formats binary bytes across magnitudes", () => {
    expect(formatBinaryBytes(0)).toBe("0 B");
    expect(formatBinaryBytes(512)).toBe("512 B");
    expect(formatBinaryBytes(1024)).toBe("1.00 KiB");
    expect(formatBinaryBytes(1024 * 10)).toBe("10.0 KiB");
    expect(formatBinaryBytes(1024 * 1024 * 5)).toBe("5.00 MiB");
    expect(formatBinaryBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.50 GiB");
  });

  it("handles plural words", () => {
    expect(plural(1, "version", "versions")).toBe("version");
    expect(plural(0, "version", "versions")).toBe("versions");
    expect(plural(2, "version", "versions")).toBe("versions");
  });

  it("translates stage labels or opens underscores as fallback", () => {
    expect(stageLabel("checking")).toBe("Checking with RomM");
    expect(stageLabel("creating_recovery")).toBe("Backing up");
    expect(stageLabel("recovery_sealed")).toBe("Backup complete");
    expect(stageLabel("repointing")).toBe("Updating the Steam shortcut");
    expect(stageLabel("removing_shortcut")).toBe("Removing the Steam shortcut");
    expect(stageLabel("removing")).toBe("Removing local data");
    expect(stageLabel("removed")).toBe("Done");
    expect(stageLabel("custom_new_stage")).toBe("custom new stage");
  });

  it("derives confirm button label based on status and progress", () => {
    expect(confirmButtonLabel(true, null)).toBe("Starting...");
    expect(
      confirmButtonLabel(false, {
        run_id: "r1",
        preview_id: "p1",
        rom_ids: [1],
        stage: "creating_recovery",
        current: 1,
        total: 3,
        name: "G",
      }),
    ).toBe("creating recovery...");
    expect(confirmButtonLabel(false, null)).toBe("Confirm Cleanup");
  });

  it("derives scan button description based on sync and run status", () => {
    expect(scanButtonDescription(true, false)).toBe("Unavailable while a library sync is running.");
    expect(scanButtonDescription(false, true)).toBe("A cleanup is running. Its progress is shown below.");
    expect(scanButtonDescription(false, false)).toBeUndefined();
  });

  it("builds verdict wording with group size and candidacy", () => {
    const candidateSingle: PrunePreviewItem = {
      rom_id: 1,
      name: "Game 1",
      fs_name: "Game 1.gba",
      group_id: "g1",
      group_size: 1,
      bound_count: 0,
      candidate: true,
      platform_slug: "gba",
      installed: false,
      installed_bytes: null,
      warning: null,
    };
    expect(verdictFor(candidateSingle).short).toBe("Gone from RomM");
    expect(verdictFor(candidateSingle).full).toContain("Gone from RomM");

    const candidateGroup: PrunePreviewItem = {
      ...candidateSingle,
      group_size: 3,
    };
    expect(verdictFor(candidateGroup).short).toBe("Gone from RomM · one of 3");

    const nonCandidate: PrunePreviewItem = {
      ...candidateSingle,
      candidate: false,
      group_size: 2,
    };
    expect(verdictFor(nonCandidate).short).toBe("Still on RomM · one of 2");
    expect(verdictFor(nonCandidate).full).toContain("Still on RomM at your last sync");
  });

  it("derives version lines", () => {
    const item: PrunePreviewItem = {
      rom_id: 42,
      name: "Sonic",
      fs_name: "Sonic (USA).bin",
      group_id: "g1",
      group_size: 1,
      bound_count: 0,
      candidate: true,
      platform_slug: "gen",
      installed: true,
      installed_bytes: 1024,
      warning: null,
    };
    expect(versionLine(item, "Sonic")).toBe("ROM 42 · Sonic (USA).bin");
    expect(versionLine({ ...item, fs_name: "Sonic" }, "Sonic")).toBe("ROM 42");
  });

  describe("confirmBlockedReason", () => {
    const baseState = {
      completed: false,
      runInFlight: false,
      allEntriesLoaded: true,
      loaded: 10,
      total: 10,
      pageLoadFailed: false,
      destructiveConfirmed: true,
      insufficientSpace: false,
      unknownSelectedSize: false,
      anyOptionChosen: true,
    };

    it("returns null when not blocked", () => {
      expect(confirmBlockedReason(baseState)).toBeNull();
    });

    it("blocks if run in flight", () => {
      expect(confirmBlockedReason({ ...baseState, runInFlight: true })?.text).toBe("A cleanup is already running.");
    });

    it("blocks while entries are still loading or failed", () => {
      const stillLoading = confirmBlockedReason({ ...baseState, allEntriesLoaded: false, loaded: 4, total: 10 });
      expect(stillLoading?.aboutList).toBe(true);
      expect(stillLoading?.text).toContain("The list is still loading (4 of 10 entries)");

      const loadFailed = confirmBlockedReason({
        ...baseState,
        allEntriesLoaded: false,
        pageLoadFailed: true,
        loaded: 4,
        total: 10,
      });
      expect(loadFailed?.aboutList).toBe(true);
      expect(loadFailed?.text).toContain("The list stopped loading at 4 of 10 entries");
    });

    it("blocks if destructive action not confirmed", () => {
      expect(confirmBlockedReason({ ...baseState, destructiveConfirmed: false })?.text).toBe(
        "Confirm you understand there will be no recovery bundle.",
      );
    });

    it("blocks if insufficient space or unknown size", () => {
      expect(confirmBlockedReason({ ...baseState, insufficientSpace: true, unknownSelectedSize: false })?.text).toBe(
        "The selected ROM content doesn't fit in the free space at the recovery target.",
      );
      expect(confirmBlockedReason({ ...baseState, insufficientSpace: true, unknownSelectedSize: true })?.text).toBe(
        "A selected ROM's size can't be measured, so the recovery bundle can't be guaranteed to fit.",
      );
    });

    it("blocks if no cleanup options chosen", () => {
      expect(confirmBlockedReason({ ...baseState, anyOptionChosen: false })?.text).toBe(
        "Choose at least one cleanup option above.",
      );
    });
  });

  describe("completionDescription & omittedWarnings", () => {
    it("handles removed in group", () => {
      expect(removedInGroup({ removed_count: 5 })).toBe(5);
      expect(removedInGroup({ removed_rom_ids: [1, 2, 3] })).toBe(3);
      expect(removedInGroup({})).toBe(0);
    });

    it("handles omitted warnings", () => {
      const item: PruneGroupResult = {
        group_id: "g1",
        status: "removed",
        rom_ids: [1],
        message: "Removed",
        warning_count: 5,
        warnings: ["w1", "w2"],
        warnings_omitted: true,
      };
      expect(omittedWarnings(item)).toBe(3);
    });

    it("formats completion descriptions", () => {
      const complete: PruneComplete = {
        success: true,
        partial: false,
        run_id: "r1",
        preview_id: "p1",
        removed_count: 1,
        problem_count: 1,
        removed_rom_ids: [1],
        affected_app_ids: [100],
        message: "Finished with 1 issue",
        results: [
          { group_id: "g1", status: "removed", rom_ids: [1], message: "Removed" },
          {
            group_id: "g2",
            status: "failed",
            rom_ids: [2],
            message: "Network error",
            warnings: ["Server unreachable"],
          },
        ],
      };
      const desc = completionDescription(complete);
      expect(desc).toContain("Finished with 1 issue");
      expect(desc).toContain("Network error");
      expect(desc).toContain("Warning: Server unreachable");
    });
  });
});
