import { describe, it, expect, vi, beforeEach } from "vitest";
import * as backend from "../api/backend";
import type { ArtworkSlotRow, ArtworkSlots } from "../api/backend";
import { applyAutomaticArtwork, applyTabSlotImage } from "./artwork";
import { loadArtworkSlots } from "./artworkSlotsStore";
import { CHOOSE_GAME_FIRST } from "./artworkTabWording";
import { showToast } from "./toast";
import * as pruneLease from "./pruneLease";
import { executeRefreshArtwork } from "./artworkRefresh";

vi.mock("../api/backend", () => ({
  refreshCoverArtwork: vi.fn(),
  getSgdbResolution: vi.fn(),
  refreshSgdbArtwork: vi.fn(),
  setArtworkSlotAutomatic: vi.fn(),
  debugLog: vi.fn(),
  isEndpointFailure: vi.fn(
    (x: unknown) =>
      typeof x === "object" && x !== null && "success" in x && (x as { success: boolean }).success === false,
  ),
}));

vi.mock("./artwork", () => ({
  applyAutomaticArtwork: vi.fn(),
  applyTabSlotImage: vi.fn(),
}));

vi.mock("./artworkSlotsStore", () => ({
  loadArtworkSlots: vi.fn(),
}));

vi.mock("./toast", () => ({
  showToast: vi.fn(),
}));

vi.mock("./pruneLease", () => ({
  capturePruneLeaseAdmission: vi.fn(() => 1 as unknown as pruneLease.PruneLeaseAdmission),
  isPruneLeaseCancellation: vi.fn(() => false),
}));

function slot(name: ArtworkSlotRow["slot"], state: ArtworkSlotRow["state"] = "automatic"): ArtworkSlotRow {
  return { slot: name, state, source: "tender", image_id: null, has_choice: false, signature: "" };
}

function slots(over: { sgdbId?: number | null; cover?: ArtworkSlotRow["state"] } = {}): ArtworkSlots {
  return {
    success: true,
    has_api_key: true,
    game: { sgdb_id: over.sgdbId === undefined ? 101 : over.sgdbId, source: "romm", name: "Game" },
    slots: [slot("cover", over.cover ?? "automatic"), slot("grid"), slot("hero"), slot("logo"), slot("icon")],
  };
}

describe("executeRefreshArtwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pruneLease.isPruneLeaseCancellation).mockReturnValue(false);
    vi.mocked(loadArtworkSlots).mockResolvedValue(slots());
    vi.mocked(applyTabSlotImage).mockResolvedValue("set");
  });

  it("reloads the cover on automatic, hands it to Steam, applies the SteamGridDB slots and toasts the count", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({
      success: true,
      message: "Cover refreshed",
      cover_path: "/grid/99p.png",
      prune_lease_token: "lease-1",
    });
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({ success: true });
    vi.mocked(applyAutomaticArtwork).mockResolvedValue(4);

    const listener = vi.fn();
    globalThis.addEventListener("romm_data_changed", listener);
    try {
      await executeRefreshArtwork({ romId: 42, appId: 999 });

      expect(backend.refreshCoverArtwork).toHaveBeenCalledWith(42);
      expect(applyTabSlotImage).toHaveBeenCalledWith(
        42,
        999,
        "cover",
        { status: "cover", prune_lease_token: "lease-1" },
        false,
      );
      expect(backend.refreshSgdbArtwork).toHaveBeenCalledWith(42, 101);
      expect(applyAutomaticArtwork).toHaveBeenCalledWith(42, 999);
      expect(showToast).toHaveBeenCalledWith("Artwork refreshed (4/4 images applied)");

      const ev = listener.mock.calls.map((c) => c[0] as CustomEvent).find((e) => e.detail?.type === "cover_refreshed");
      expect(ev?.detail).toEqual({ type: "cover_refreshed", rom_id: 42 });
    } finally {
      globalThis.removeEventListener("romm_data_changed", listener);
    }
  });

  it("leaves a cover the user chose alone", async () => {
    vi.mocked(loadArtworkSlots).mockResolvedValue(slots({ cover: "chosen" }));
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({ success: true });
    vi.mocked(applyAutomaticArtwork).mockResolvedValue(4);

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(backend.refreshCoverArtwork).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Artwork refreshed (4/4 images applied)");
  });

  it("where RomM has no cover, sets Tender's SteamGridDB cover and counts it", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({
      success: false,
      reason: "no_cover",
      message: "ROM has no cover artwork",
    });
    const served = { status: "cover", prune_lease_token: "lease-2" } as never;
    vi.mocked(backend.setArtworkSlotAutomatic).mockResolvedValue(served);
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({ success: true });
    vi.mocked(applyAutomaticArtwork).mockResolvedValue(4);

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(backend.setArtworkSlotAutomatic).toHaveBeenCalledWith(42, "cover");
    expect(applyTabSlotImage).toHaveBeenCalledWith(42, 999, "cover", served, false);
    expect(showToast).toHaveBeenCalledWith("Artwork refreshed (5/5 images applied)");
  });

  it("a cover reload that failed for another reason is said beside the SteamGridDB answer", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockRejectedValue(new Error("network down"));
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({
      success: false,
      reason: "auth_failed",
      message: "SteamGridDB refused the API key — check it in Settings",
    });

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(backend.debugLog).toHaveBeenCalledWith(expect.stringContaining("refreshCoverArtwork rejected"));
    expect(backend.setArtworkSlotAutomatic).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "SteamGridDB refused the API key — check it in Settings. The RomM cover could not be updated: the request did not complete",
    );
    expect(applyAutomaticArtwork).not.toHaveBeenCalled();
  });

  it("slots that could not be read: toasts 'Failed to refresh artwork' and touches nothing", async () => {
    vi.mocked(loadArtworkSlots).mockResolvedValue(null);

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(showToast).toHaveBeenCalledWith("Failed to refresh artwork");
    expect(backend.refreshCoverArtwork).not.toHaveBeenCalled();
    expect(backend.getSgdbResolution).not.toHaveBeenCalled();
  });

  it("no SteamGridDB game: says where to choose one, the surface's sentence where it gives one", async () => {
    vi.mocked(loadArtworkSlots).mockResolvedValue(slots({ sgdbId: null }));

    await executeRefreshArtwork({ romId: 42, appId: 999 });
    expect(showToast).toHaveBeenLastCalledWith(CHOOSE_GAME_FIRST);

    await executeRefreshArtwork({ romId: 42, appId: 999, chooseGameFirst: "Choose it in the menu." });
    expect(showToast).toHaveBeenLastCalledWith("Choose it in the menu.");
    expect(backend.getSgdbResolution).not.toHaveBeenCalled();
  });

  it("decision=needs_pick: chooses nothing and says where the game is chosen", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    const candidates = [{ id: 1, name: "Candidate 1", release_year: 2000, thumb_url: "https://thumb" }];
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "needs_pick", candidates });

    await executeRefreshArtwork({ romId: 42, appId: 999, chooseGameFirst: "Choose it in the menu." });

    expect(showToast).toHaveBeenCalledWith("Choose it in the menu.");
    expect(backend.refreshSgdbArtwork).not.toHaveBeenCalled();
  });

  it("getSgdbResolution rejection: debugLogs and toasts 'Failed to refresh artwork'", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    vi.mocked(backend.getSgdbResolution).mockRejectedValue(new Error("sgdb down"));

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(backend.debugLog).toHaveBeenCalledWith(expect.stringContaining("getSgdbResolution rejected"));
    expect(showToast).toHaveBeenCalledWith("Failed to refresh artwork");
  });

  it("getSgdbResolution endpoint failure: toasts the failure message", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({
      success: false,
      reason: "rate_limited",
      message: "SteamGridDB is rate-limiting requests — try again in a moment",
    });

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(showToast).toHaveBeenCalledWith("SteamGridDB is rate-limiting requests — try again in a moment");
  });

  it("decision=no_api_key: toasts 'Set a SteamGridDB API key in Settings first'", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "no_api_key" });

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(showToast).toHaveBeenCalledWith("Set a SteamGridDB API key in Settings first");
  });

  it("reads the slots again once it ends, whatever it came to", async () => {
    vi.mocked(loadArtworkSlots).mockResolvedValueOnce(slots({ sgdbId: null }));

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(loadArtworkSlots).toHaveBeenCalledTimes(2);
    expect(loadArtworkSlots).toHaveBeenLastCalledWith(999, 42);
  });

  it("prune lease cancellation: debugLogs cancellation and suppresses toast", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockImplementation(() => {
      throw new Error("lease cancelled");
    });
    vi.mocked(pruneLease.isPruneLeaseCancellation).mockReturnValue(true);

    await executeRefreshArtwork({ romId: 42, appId: 999, tag: "TestTag" });

    expect(backend.debugLog).toHaveBeenCalledWith(expect.stringContaining("TestTag: continuation was cancelled"));
    expect(showToast).not.toHaveBeenCalled();
  });
});
