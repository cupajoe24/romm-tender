import { describe, it, expect, vi, beforeEach } from "vitest";
import * as backend from "../api/backend";
import { applyArtwork } from "./artwork";
import { showToast } from "./toast";
import * as pruneLease from "./pruneLease";
import { executeRefreshArtwork } from "./artworkRefresh";

vi.mock("../api/backend", () => ({
  refreshCoverArtwork: vi.fn(),
  getSgdbResolution: vi.fn(),
  refreshSgdbArtwork: vi.fn(),
  debugLog: vi.fn(),
  isEndpointFailure: vi.fn(
    (x: unknown) =>
      typeof x === "object" && x !== null && "success" in x && (x as { success: boolean }).success === false,
  ),
}));

vi.mock("./artwork", () => ({
  applyArtwork: vi.fn(),
}));

vi.mock("./toast", () => ({
  showToast: vi.fn(),
}));

vi.mock("./pruneLease", () => ({
  capturePruneLeaseAdmission: vi.fn(() => 1 as unknown as pruneLease.PruneLeaseAdmission),
  isPruneLeaseCancellation: vi.fn(() => false),
}));

describe("executeRefreshArtwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: refreshes cover, resolves SGDB, refreshes SGDB, applies art and toasts result", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({
      success: true,
      message: "Cover refreshed",
      cover_path: "/grid/99p.png",
    });
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({ success: true });
    vi.mocked(applyArtwork).mockResolvedValue(4);

    const listener = vi.fn();
    globalThis.addEventListener("romm_data_changed", listener);
    try {
      await executeRefreshArtwork({ romId: 42, appId: 999 });

      expect(backend.refreshCoverArtwork).toHaveBeenCalledWith(42);
      expect(backend.getSgdbResolution).toHaveBeenCalledWith(42);
      expect(backend.refreshSgdbArtwork).toHaveBeenCalledWith(42, 101);
      expect(applyArtwork).toHaveBeenCalledWith(42, 999);
      expect(showToast).toHaveBeenCalledWith("Artwork refreshed (4/4 images applied)");

      const ev = listener.mock.calls.map((c) => c[0] as CustomEvent).find((e) => e.detail?.type === "cover_refreshed");
      expect(ev?.detail).toEqual({ type: "cover_refreshed", rom_id: 42 });
    } finally {
      globalThis.removeEventListener("romm_data_changed", listener);
    }
  });

  it("cover refresh failure: debugLogs error and includes cover failure in final toast", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({
      success: false,
      reason: "no_cover",
      message: "ROM has no cover artwork",
    });
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({ success: true });
    vi.mocked(applyArtwork).mockResolvedValue(4);

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(backend.debugLog).toHaveBeenCalledWith(expect.stringContaining("refreshCoverArtwork failed: no_cover"));
    expect(showToast).toHaveBeenCalledWith(
      "Artwork refreshed (4/4 images applied). The RomM cover could not be updated: ROM has no cover artwork",
    );
  });

  it("cover refresh rejection: debugLogs rejection and treats as request did not complete", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockRejectedValue(new Error("network down"));
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({
      success: false,
      reason: "auth_failed",
      message: "SteamGridDB refused the API key — check it in Settings",
    });

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(backend.debugLog).toHaveBeenCalledWith(expect.stringContaining("refreshCoverArtwork rejected"));
    expect(showToast).toHaveBeenCalledWith(
      "SteamGridDB refused the API key — check it in Settings. The RomM cover could not be updated: the request did not complete",
    );
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

  it("decision=resolved with refreshSgdbArtwork endpoint failure: toasts refusal message", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "resolved", sgdb_id: 101 });
    vi.mocked(backend.refreshSgdbArtwork).mockResolvedValue({
      success: false,
      reason: "rate_limited",
      message: "SteamGridDB is rate-limiting requests — try again in a moment",
    });

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(showToast).toHaveBeenCalledWith("SteamGridDB is rate-limiting requests — try again in a moment");
    expect(applyArtwork).not.toHaveBeenCalled();
  });

  it("decision=needs_pick with onNeedsPick callback: calls onNeedsPick with candidates", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    const candidates = [{ id: 1, name: "Candidate 1", release_year: 2000, thumb_url: "https://thumb" }];
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "needs_pick", candidates });
    const onNeedsPick = vi.fn();

    await executeRefreshArtwork({ romId: 42, appId: 999, onNeedsPick });

    expect(onNeedsPick).toHaveBeenCalledWith(candidates);
  });

  it("decision=needs_pick with coverFailure: toasts cover failure notice", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({
      success: false,
      reason: "no_cover",
      message: "ROM has no cover artwork",
    });
    const candidates = [{ id: 1, name: "Candidate 1", release_year: 2000, thumb_url: "https://thumb" }];
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "needs_pick", candidates });
    const onNeedsPick = vi.fn();

    await executeRefreshArtwork({ romId: 42, appId: 999, onNeedsPick });

    expect(showToast).toHaveBeenCalledWith("The RomM cover could not be updated: ROM has no cover artwork");
    expect(onNeedsPick).toHaveBeenCalledWith(candidates);
  });

  it("decision=needs_pick without onNeedsPick callback: toasts notice", async () => {
    vi.mocked(backend.refreshCoverArtwork).mockResolvedValue({ success: true, message: "ok" });
    const candidates = [{ id: 1, name: "Candidate 1", release_year: 2000, thumb_url: "https://thumb" }];
    vi.mocked(backend.getSgdbResolution).mockResolvedValue({ decision: "needs_pick", candidates });

    await executeRefreshArtwork({ romId: 42, appId: 999 });

    expect(showToast).toHaveBeenCalledWith("Multiple SteamGridDB matches found");
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
