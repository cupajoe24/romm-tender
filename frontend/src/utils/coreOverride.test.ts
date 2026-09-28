import { describe, it, expect, beforeEach, vi } from "vitest";
import { toaster } from "../api/host";
import * as backend from "../api/backend";
import { setLaunchOptionsConfirmed } from "./steamShortcuts";
import { mountPruneLeaseOwner } from "./pruneLease";
import { applyGameCoreChange } from "./coreOverride";

vi.mock("../api/backend", () => ({
  setGameCore: vi.fn(),
  clearGameCore: vi.fn(),
  debugLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./steamShortcuts", () => ({
  setLaunchOptionsConfirmed: vi.fn().mockResolvedValue(true),
}));

describe("coreOverride — applyGameCoreChange", () => {
  const leaseOwner = "test-core-owner";

  beforeEach(() => {
    mountPruneLeaseOwner(leaseOwner);
    vi.mocked(backend.setGameCore).mockReset();
    vi.mocked(backend.clearGameCore).mockReset();
    vi.mocked(backend.debugLog).mockReset();
    vi.mocked(setLaunchOptionsConfirmed).mockReset().mockResolvedValue(true);
    vi.mocked(toaster.toast).mockReset();
  });

  it("pins a core override and confirms launch options on success", async () => {
    vi.mocked(backend.setGameCore).mockResolvedValue({
      success: true,
      launch_options: "flatpak run -e core.so",
      app_id: 1234,
    });
    const onSuccess = vi.fn();

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: "Snes9x",
      leaseOwner,
      onSuccess,
    });

    expect(outcome.success).toBe(true);
    expect(backend.setGameCore).toHaveBeenCalledWith(42, "Snes9x");
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(1234, "flatpak run -e core.so");
    expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Core set to Snes9x" }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows distinct restart Steam toast when launch options are unconfirmed", async () => {
    vi.mocked(backend.setGameCore).mockResolvedValue({
      success: true,
      launch_options: "flatpak run -e core.so",
      app_id: 1234,
    });
    vi.mocked(setLaunchOptionsConfirmed).mockResolvedValue(false);
    const onSuccess = vi.fn();

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: "Snes9x",
      leaseOwner,
      onSuccess,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.unconfirmed).toBe(true);
    expect(toaster.toast).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Core saved — restart Steam to apply" }),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("pins a core override without launch options (uninstalled ROM)", async () => {
    vi.mocked(backend.setGameCore).mockResolvedValue({
      success: true,
    });
    const onSuccess = vi.fn();

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: "Genesis Plus GX",
      leaseOwner,
      onSuccess,
    });

    expect(outcome.success).toBe(true);
    expect(setLaunchOptionsConfirmed).not.toHaveBeenCalled();
    expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Core set to Genesis Plus GX" }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("clears a core override and reverts to following system core", async () => {
    vi.mocked(backend.clearGameCore).mockResolvedValue({
      success: true,
      launch_options: "flatpak run default.so",
      app_id: 1234,
    });
    const onSuccess = vi.fn();

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: null,
      leaseOwner,
      onSuccess,
    });

    expect(outcome.success).toBe(true);
    expect(backend.clearGameCore).toHaveBeenCalledWith(42);
    expect(setLaunchOptionsConfirmed).toHaveBeenCalledWith(1234, "flatpak run default.so");
    expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Now following the system core" }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("toasts failure message on set failure", async () => {
    vi.mocked(backend.setGameCore).mockResolvedValue({
      success: false,
      message: "Core binary missing",
    });
    const onSuccess = vi.fn();

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: "Snes9x",
      leaseOwner,
      onSuccess,
    });

    expect(outcome.success).toBe(false);
    expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Core binary missing" }));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("toasts fallback failure message on clear failure without message", async () => {
    vi.mocked(backend.clearGameCore).mockResolvedValue({
      success: false,
    });
    const onSuccess = vi.fn();

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: null,
      leaseOwner,
      onSuccess,
    });

    expect(outcome.success).toBe(false);
    expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Failed to reset core" }));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("suppresses toast on prune lease cancellation", async () => {
    const { PruneLeaseAdmissionCancelled } = await import("./pruneLease");
    vi.mocked(backend.setGameCore).mockRejectedValue(new PruneLeaseAdmissionCancelled("unmounted"));

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: "Snes9x",
      leaseOwner,
    });

    expect(outcome.success).toBe(false);
    expect(toaster.toast).not.toHaveBeenCalled();
    expect(backend.debugLog).toHaveBeenCalledWith(expect.stringContaining("continuation was cancelled"));
  });

  it("toasts generic failure on unexpected exception", async () => {
    vi.mocked(backend.setGameCore).mockRejectedValue(new Error("RPC failed"));

    const outcome = await applyGameCoreChange({
      romId: 42,
      coreLabel: "Snes9x",
      leaseOwner,
    });

    expect(outcome.success).toBe(false);
    expect(toaster.toast).toHaveBeenCalledWith(expect.objectContaining({ body: "Failed to set core" }));
  });
});
