import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { toaster } from "../api/host";
import * as backend from "../api/backend";
import type { DiscSelection } from "../api/backend";
import { setLaunchOptionsConfirmed } from "./steamShortcuts";
import {
  computeDiscDisplayState,
  buildDiscOptions,
  fetchDiscSelection,
  executeDiscSelection,
  DiscStack,
  DiscWithNumber,
  DISC_GREY,
  DISC_ACCENT,
} from "./discSelection";

vi.mock("../api/backend", () => ({
  getDiscSelection: vi.fn(),
  selectDisc: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("./steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
}));

const m3uSelection: DiscSelection = {
  multi_disc: true,
  discs: [
    { filename: "ff7 (Disc 1).cue", label: "Disc 1", index: 1 },
    { filename: "ff7 (Disc 2).cue", label: "Disc 2", index: 2 },
    { filename: "ff7 (Disc 3).cue", label: "Disc 3", index: 3 },
  ],
  selected: null,
  default: { kind: "m3u", label: "All discs (m3u)", filename: "ff7.m3u" },
};

const discDefaultSelection: DiscSelection = {
  multi_disc: true,
  discs: [
    { filename: "game (Disc 1).chd", label: "Disc 1", index: 1 },
    { filename: "game (Disc 2).chd", label: "Disc 2", index: 2 },
  ],
  selected: "game (Disc 2).chd",
  default: { kind: "disc", label: "Disc 1", filename: "game (Disc 1).chd" },
};

describe("discSelection — computeDiscDisplayState", () => {
  it("returns null if selection is missing or not multi-disc", () => {
    expect(computeDiscDisplayState(null, null)).toBeNull();
    expect(computeDiscDisplayState(undefined, null)).toBeNull();
    expect(computeDiscDisplayState({ multi_disc: false }, null)).toBeNull();
    expect(
      computeDiscDisplayState(
        {
          multi_disc: true,
          discs: undefined,
          default: { kind: "disc", label: "D1", filename: "d1" },
        } as unknown as DiscSelection,
        null,
      ),
    ).toBeNull();
  });

  it("computes state for m3u default with no pin (following playlist)", () => {
    const state = computeDiscDisplayState(m3uSelection, null);
    expect(state).toEqual({
      isM3u: true,
      effectiveSelected: null,
      isPinned: false,
      showPlaylistFace: true,
      activeNum: "",
    });
  });

  it("computes state for m3u default with a pinned disc", () => {
    const state = computeDiscDisplayState(m3uSelection, "ff7 (Disc 2).cue");
    expect(state).toEqual({
      isM3u: true,
      effectiveSelected: "ff7 (Disc 2).cue",
      isPinned: true,
      showPlaylistFace: false,
      activeNum: "2",
    });
  });

  it("computes state for disc default (no m3u)", () => {
    const unpinned = computeDiscDisplayState(discDefaultSelection, null);
    expect(unpinned).toEqual({
      isM3u: false,
      effectiveSelected: "game (Disc 1).chd",
      isPinned: false,
      showPlaylistFace: false,
      activeNum: "1",
    });

    const pinned = computeDiscDisplayState(discDefaultSelection, "game (Disc 2).chd");
    expect(pinned).toEqual({
      isM3u: false,
      effectiveSelected: "game (Disc 2).chd",
      isPinned: true,
      showPlaylistFace: false,
      activeNum: "2",
    });
  });

  it("falls back to disc index if label contains no number", () => {
    const customSelection: DiscSelection = {
      multi_disc: true,
      discs: [{ filename: "discA.iso", label: "Special Edition", index: 4 }],
      selected: "discA.iso",
      default: { kind: "disc", label: "Special Edition", filename: "discA.iso" },
    };
    const state = computeDiscDisplayState(customSelection, "discA.iso");
    expect(state?.activeNum).toBe("4");
  });
});

describe("discSelection — buildDiscOptions", () => {
  it("builds options including m3u default when present", () => {
    const options = buildDiscOptions(m3uSelection);
    expect(options).toHaveLength(4);
    expect(options[0]).toMatchObject({ data: null, text: "All discs (m3u)" });
    expect(options[1]).toMatchObject({ data: "ff7 (Disc 1).cue", text: "Disc 1" });
    expect(options[2]).toMatchObject({ data: "ff7 (Disc 2).cue", text: "Disc 2" });
    expect(options[3]).toMatchObject({ data: "ff7 (Disc 3).cue", text: "Disc 3" });
  });

  it("builds options without m3u entry when default is a disc", () => {
    const options = buildDiscOptions(discDefaultSelection);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ data: "game (Disc 1).chd", text: "Disc 1" });
    expect(options[1]).toMatchObject({ data: "game (Disc 2).chd", text: "Disc 2" });
  });

  it("returns empty array when discs or default are missing", () => {
    expect(buildDiscOptions({ multi_disc: true } as unknown as DiscSelection)).toEqual([]);
  });
});

describe("discSelection — fetchDiscSelection", () => {
  beforeEach(() => {
    vi.mocked(backend.getDiscSelection).mockReset();
    vi.mocked(backend.logError).mockReset();
  });

  it("returns selection on success", async () => {
    vi.mocked(backend.getDiscSelection).mockResolvedValue(m3uSelection);
    const result = await fetchDiscSelection(42);
    expect(result).toBe(m3uSelection);
    expect(backend.getDiscSelection).toHaveBeenCalledWith(42);
  });

  it("logs error and returns null on failure", async () => {
    vi.mocked(backend.getDiscSelection).mockRejectedValue(new Error("network error"));
    const result = await fetchDiscSelection(42, "CustomTag");
    expect(result).toBeNull();
    expect(backend.logError).toHaveBeenCalledWith(expect.stringContaining("CustomTag: getDiscSelection failed"));
  });
});

import { mountPruneLeaseOwner } from "./pruneLease";

describe("discSelection — executeDiscSelection", () => {
  beforeEach(() => {
    mountPruneLeaseOwner("test-owner");
    vi.mocked(backend.selectDisc).mockReset();
    vi.mocked(backend.logError).mockReset();
    vi.mocked(backend.logWarn).mockReset();
    vi.mocked(setLaunchOptionsConfirmed).mockReset();
    vi.mocked(setLaunchOptionsConfirmed).mockResolvedValue(true);
    vi.mocked(toaster.toast).mockReset();
  });

  it("applies disc selection with launch options and calls onSelected", async () => {
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: true,
      launch_options: "run disc2",
      selected: "disc2.iso",
    });
    const onSelected = vi.fn();

    const ok = await executeDiscSelection({
      appId: 100,
      romId: 42,
      data: "disc2.iso",
      leaseOwner: "test-owner",
      onSelected,
    });

    expect(ok).toBe(true);
    expect(backend.selectDisc).toHaveBeenCalledWith(42, "disc2.iso");
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(100, "run disc2");
    expect(onSelected).toHaveBeenCalledWith("disc2.iso");
  });

  it("handles clearing pin (data: null) successfully", async () => {
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: true,
      launch_options: "run m3u",
      selected: null,
    });
    const onSelected = vi.fn();

    const ok = await executeDiscSelection({
      appId: 100,
      romId: 42,
      data: null,
      leaseOwner: "test-owner",
      onSelected,
    });

    expect(ok).toBe(true);
    expect(backend.selectDisc).toHaveBeenCalledWith(42, null);
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(100, "run m3u");
    expect(onSelected).toHaveBeenCalledWith(null);
  });

  it("toasts message when backend returns success: false", async () => {
    vi.mocked(backend.selectDisc).mockResolvedValue({
      success: false,
      message: "Disc not found on disk",
    });
    const onSelected = vi.fn();

    const ok = await executeDiscSelection({
      appId: 100,
      romId: 42,
      data: "disc2.iso",
      leaseOwner: "test-owner",
      onSelected,
    });

    expect(ok).toBe(false);
    expect(setLaunchOptionsConfirmed).not.toHaveBeenCalled();
    expect(onSelected).not.toHaveBeenCalled();
    expect(toaster.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tender",
        body: "Disc not found on disk",
      }),
    );
  });

  it("toasts generic failure on error rejection", async () => {
    vi.mocked(backend.selectDisc).mockRejectedValue(new Error("RPC failed"));
    const onSelected = vi.fn();

    const ok = await executeDiscSelection({
      appId: 100,
      romId: 42,
      data: "disc2.iso",
      leaseOwner: "test-owner",
      onSelected,
    });

    expect(ok).toBe(false);
    expect(toaster.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Tender",
        body: "Failed to select disc",
      }),
    );
  });

  it("handles prune lease cancellation silently with a warn log", async () => {
    const { PruneLeaseAdmissionCancelled } = await import("./pruneLease");
    vi.mocked(backend.selectDisc).mockRejectedValue(new PruneLeaseAdmissionCancelled("cancelled"));
    const onSelected = vi.fn();

    const ok = await executeDiscSelection({
      appId: 100,
      romId: 42,
      data: "disc2.iso",
      leaseOwner: "test-owner",
      onSelected,
      logTag: "CustomTag",
    });

    expect(ok).toBe(false);
    expect(backend.logWarn).toHaveBeenCalledWith(
      expect.stringContaining("CustomTag: disc selection continuation was cancelled"),
    );
    expect(toaster.toast).not.toHaveBeenCalled();
  });
});

describe("discSelection — visual components", () => {
  it("renders DiscStack with two icons", () => {
    const { container } = render(<DiscStack size={20} color={DISC_GREY} />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
  });

  it("renders DiscWithNumber with number label", () => {
    const { container } = render(<DiscWithNumber size={20} color={DISC_ACCENT} num="2" />);
    expect(container.textContent).toContain("2");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});
