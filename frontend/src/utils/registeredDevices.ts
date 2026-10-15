/**
 * Pure selectors, formatters and load-state classifications for the
 * registered devices table, shared by both surfaces (the QAM's Settings page
 * and the desktop's Tender Settings window).
 */

import type { RegisteredDevice } from "../types";

export const REGISTERED_DEVICES_HEADING = "Registered Devices";
export const DEVICE_TABLE_HEADERS = ["Device", "Client", "Last seen"] as const;
export const CURRENT_DEVICE_LABEL = "(this device)";
export const DEVICES_LOADING_LABEL = "Loading...";
export const DEVICES_ERROR_LABEL = "Could not load devices";
export const NO_DEVICES_LABEL = "No devices registered";

/** The display name of a device, falling back to "(unnamed)". */
export const deviceRowTitle = (device: RegisteredDevice): string => device.name ?? "(unnamed)";

/** The client name and version string (e.g. "Tender v1.0.0" or "unknown client v?"). */
export const deviceClientString = (device: RegisteredDevice): string =>
  `${device.client ?? "unknown client"} v${device.client_version ?? "?"}`;

/** Whether the device represents the currently running machine. */
export const isCurrentDevice = (device: RegisteredDevice): boolean => Boolean(device.is_current_device);

export type DeviceListState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "empty" }
  | { readonly kind: "loaded"; readonly devices: readonly RegisteredDevice[] };

/**
 * Classify the device list into one of four load states: loading, error, empty,
 * or loaded with active devices.
 */
export function deviceListState(
  loading: boolean,
  error: string | null,
  devices: readonly RegisteredDevice[] | null,
): DeviceListState {
  if (loading) return { kind: "loading" };
  if (error) return { kind: "error", message: error };
  if (devices === null || devices.length === 0) return { kind: "empty" };
  return { kind: "loaded", devices };
}
