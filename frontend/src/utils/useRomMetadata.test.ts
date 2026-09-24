import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRomMetadata } from "./useRomMetadata";
import * as sharedReads from "../api/sharedReads";
import type { RomMetadata } from "../types";

vi.mock("../api/sharedReads", () => ({
  getRomMetadataShared: vi.fn(),
}));

describe("useRomMetadata", () => {
  const sampleMeta: RomMetadata = {
    summary: "Test RPG",
    genres: ["RPG"],
    companies: ["Dev"],
    first_release_date: 100000,
    average_rating: 85,
    game_modes: ["Single player"],
    player_count: "1",
    cached_at: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when romId is null or undefined", () => {
    const { result } = renderHook(() => useRomMetadata(null));
    expect(result.current).toBeNull();
    expect(sharedReads.getRomMetadataShared).not.toHaveBeenCalled();
  });

  it("loads and returns metadata when romId is provided", async () => {
    vi.mocked(sharedReads.getRomMetadataShared).mockResolvedValue(sampleMeta);

    const { result } = renderHook(() => useRomMetadata(42));
    await waitFor(() => {
      expect(result.current).toEqual(sampleMeta);
    });
    expect(sharedReads.getRomMetadataShared).toHaveBeenCalledWith(42);
  });

  it("returns null when getRomMetadataShared rejects", async () => {
    vi.mocked(sharedReads.getRomMetadataShared).mockRejectedValue(new Error("Network fail"));

    const { result } = renderHook(() => useRomMetadata(42));
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });
});
