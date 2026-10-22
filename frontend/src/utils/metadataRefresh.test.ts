import { describe, it, expect, vi, beforeEach } from "vitest";
import * as backend from "../api/backend";
import { showToast } from "./toast";
import { executeRefreshMetadata } from "./metadataRefresh";

vi.mock("../api/backend", () => ({
  getRomMetadata: vi.fn(),
}));

vi.mock("./toast", () => ({
  showToast: vi.fn(),
}));

describe("executeRefreshMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: fetches metadata, toasts 'Metadata refreshed', and dispatches romm_data_changed", async () => {
    vi.mocked(backend.getRomMetadata).mockResolvedValue({} as never);
    const listener = vi.fn();
    globalThis.addEventListener("romm_data_changed", listener);
    try {
      await executeRefreshMetadata(42);

      expect(backend.getRomMetadata).toHaveBeenCalledWith(42);
      expect(showToast).toHaveBeenCalledWith("Metadata refreshed");
      const ev = listener.mock.calls.map((c) => c[0] as CustomEvent).find((e) => e.detail?.type === "metadata");
      expect(ev?.detail).toEqual({ type: "metadata", rom_id: 42 });
    } finally {
      globalThis.removeEventListener("romm_data_changed", listener);
    }
  });

  it("rejection: toasts 'Failed to refresh metadata' and does not dispatch romm_data_changed", async () => {
    vi.mocked(backend.getRomMetadata).mockRejectedValue(new Error("network error"));
    const listener = vi.fn();
    globalThis.addEventListener("romm_data_changed", listener);
    try {
      await executeRefreshMetadata(42);

      expect(backend.getRomMetadata).toHaveBeenCalledWith(42);
      expect(showToast).toHaveBeenCalledWith("Failed to refresh metadata");
      const ev = listener.mock.calls.map((c) => c[0] as CustomEvent).find((e) => e.detail?.type === "metadata");
      expect(ev).toBeUndefined();
    } finally {
      globalThis.removeEventListener("romm_data_changed", listener);
    }
  });
});
