import { describe, it, expect } from "vitest";
import type { RegisteredDevice } from "../types";
import {
  CURRENT_DEVICE_LABEL,
  DEVICES_ERROR_LABEL,
  DEVICES_LOADING_LABEL,
  DEVICE_TABLE_HEADERS,
  NO_DEVICES_LABEL,
  REGISTERED_DEVICES_HEADING,
  deviceClientString,
  deviceListState,
  deviceRowTitle,
  isCurrentDevice,
} from "./registeredDevices";

const device = (over: Partial<RegisteredDevice> = {}): RegisteredDevice => ({
  id: "dev-1",
  name: "Steam Deck",
  platform: "linux",
  client: "Tender",
  client_version: "1.0.0",
  last_seen: "2025-06-15T12:00:00Z",
  created_at: "2025-01-01T00:00:00Z",
  is_current_device: false,
  ...over,
});

describe("registeredDevices pure helpers", () => {
  it("formats the device row title or falls back to unnamed", () => {
    expect(deviceRowTitle(device({ name: "My Deck" }))).toBe("My Deck");
    expect(deviceRowTitle(device({ name: null }))).toBe("(unnamed)");
    expect(deviceRowTitle({} as unknown as RegisteredDevice)).toBe("(unnamed)");
  });

  it("formats the client string or provides fallbacks", () => {
    expect(deviceClientString(device({ client: "Tender", client_version: "1.0.0" }))).toBe("Tender v1.0.0");
    expect(deviceClientString(device({ client: null, client_version: null }))).toBe("unknown client v?");
    expect(deviceClientString({} as unknown as RegisteredDevice)).toBe("unknown client v?");
  });

  it("identifies whether a device is the current device", () => {
    expect(isCurrentDevice(device({ is_current_device: true }))).toBe(true);
    expect(isCurrentDevice(device({ is_current_device: false }))).toBe(false);
    expect(isCurrentDevice({} as unknown as RegisteredDevice)).toBe(false);
  });

  it("exports the expected table constants", () => {
    expect(REGISTERED_DEVICES_HEADING).toBe("Registered Devices");
    expect(DEVICE_TABLE_HEADERS).toEqual(["Device", "Client", "Last seen"]);
    expect(CURRENT_DEVICE_LABEL).toBe("(this device)");
    expect(DEVICES_LOADING_LABEL).toBe("Loading...");
    expect(DEVICES_ERROR_LABEL).toBe("Could not load devices");
    expect(NO_DEVICES_LABEL).toBe("No devices registered");
  });

  describe("deviceListState", () => {
    it("reports loading when loading is true regardless of errors or devices", () => {
      expect(deviceListState(true, null, null)).toEqual({ kind: "loading" });
      expect(deviceListState(true, "some error", [device()])).toEqual({ kind: "loading" });
    });

    it("reports error when not loading and an error is present", () => {
      expect(deviceListState(false, "Server error", null)).toEqual({ kind: "error", message: "Server error" });
    });

    it("reports empty when devices is null or an empty array", () => {
      expect(deviceListState(false, null, null)).toEqual({ kind: "empty" });
      expect(deviceListState(false, null, [])).toEqual({ kind: "empty" });
    });

    it("reports loaded with the list of devices when valid", () => {
      const list = [device({ id: "1" }), device({ id: "2" })];
      expect(deviceListState(false, null, list)).toEqual({ kind: "loaded", devices: list });
    });
  });
});
