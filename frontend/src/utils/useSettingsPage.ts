/**
 * Everything the settings know and do: the RomM connection and sign-in,
 * SteamGridDB, Save Sync and the registered devices, the controller, the Steam
 * library's preferences, updates and the log level.
 *
 * One hook for every section rather than one per section, so a surface reads
 * `get_settings` once for all of them. Both drawings read it: the QAM's Settings
 * page, whose pane mounts only the focused section and so cannot let a section
 * own its reads, and the settings tabs of the desktop's Tender Settings window,
 * each holding an instance of its own. The two questions a change asks first
 * are drawn by the surface (`SettingsPrompts`).
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Settings.
 */

import { useEffect, useRef, useState } from "react";
import {
  applySteamInputSetting,
  ensureDeviceRegistered,
  fixRetroarchInputDriver,
  getKnownRegions,
  getSaveSyncSettings,
  getSettings,
  listDevices,
  logError,
  saveCollectionPlatformGroups,
  saveCustomHeaders,
  saveLogLevel,
  savePreferredRegion,
  saveServerUrl,
  saveSgdbApiKey,
  saveSteamInputSetting,
  setCollectionNamingMode,
  signOut,
  syncAllSaves,
  updateSaveSyncSettings,
} from "../api/backend";
import type {
  CollectionNamingMode,
  CustomHeaderEntry,
  RegisteredDevice,
  RetroArchInputCheck,
  SaveSyncSettings,
} from "../types";
import type { SaveHeadersResult } from "./customHeaders";
import { detach } from "./detach";
import { AUTO_REGION, regionLabel } from "./preferredRegion";
import { INVALID_URL_MESSAGE, signInToRomm, type SignInRequest, type SignInResult } from "./rommSignIn";
import { isValidServerUrl, trimServerUrl } from "./serverUrl";
import { showToast } from "./toast";
import { useUpdateOutcomeState, type UpdateOutcomeState } from "./updateOutcomeStore";
import {
  CHECK_OUTCOME_LINES,
  runUpdateCheckNow,
  setUpdateCheckSwitch,
  useUpdateNoticeState,
  type UpdateNoticeState,
} from "./updateNoticeStore";

/** The two questions a change asks before it is made, each drawn by the surface. */
export interface SettingsPrompts {
  /** Before Save Sync is turned on; true to turn it on. */
  confirmEnableSaveSync: () => Promise<boolean>;
  /** Before the preferred region changes, naming the region now and the one chosen; true to save. */
  confirmPreferredRegion: (fromLabel: string, toLabel: string) => Promise<boolean>;
}

/**
 * A RomM URL typed on a surface whose editor can unmount the page before the
 * save is tried: read in place of the stored URL when the settings load, and
 * dropped once its save has been tried.
 */
export interface PendingEdits {
  url?: string;
}

export interface SettingsPageState {
  // Connections
  url: string;
  hasToken: boolean;
  /** The Connections section's one status line: a sign-in's confirmation, a URL refused, a save that failed. */
  status: string;
  allowInsecureSsl: boolean;
  /** Names only — a configured header's value is a proxy credential the backend never sends back. */
  customHeaderNames: string[];
  /** Truthy once a key is configured; never the key. */
  sgdbApiKey: string;
  saveUrl: (value: string) => void;
  saveCustomHeaders: (headers: CustomHeaderEntry[]) => Promise<SaveHeadersResult>;
  setAllowInsecureSsl: (value: boolean) => void;
  signIn: (request: SignInRequest) => Promise<SignInResult>;
  signOut: () => void;
  saveSgdbKey: (value: string) => Promise<void>;

  // Save Sync
  saveSyncSettings: SaveSyncSettings | null;
  deviceInfo: { device_id: string; device_name: string } | null;
  syncing: boolean;
  syncStatus: string;
  registeredDevices: RegisteredDevice[] | null;
  devicesLoading: boolean;
  devicesError: string | null;
  changeSaveSyncSetting: (partial: Partial<SaveSyncSettings>) => void;
  /** Turning it on asks `confirmEnableSaveSync` first; turning it off does not ask. */
  toggleSaveSync: (value: boolean) => void;
  submitDefaultSlot: (value: string) => void;
  resetDefaultSlot: () => void;
  syncAll: () => void;

  // Controller
  steamInputMode: string;
  steamInputStatus: string;
  applyingSteamInput: boolean;
  retroarchWarning: RetroArchInputCheck | null;
  retroarchFixStatus: string;
  changeSteamInputMode: (mode: string) => void;
  applySteamInput: () => void;
  fixInputDriver: () => void;

  // Steam Library
  preferredRegion: string;
  /** Distinct regions in the locally synced library — the non-anchor options. */
  libraryRegions: string[];
  platformGroups: boolean;
  namingMode: CollectionNamingMode;
  changePreferredRegion: (region: string) => void;
  changePlatformGroups: (value: boolean) => void;
  changeNamingMode: (mode: CollectionNamingMode) => void;

  // Updates — the answer itself lives in the module store, which panel load
  // fills and Main's notice reads too.
  update: UpdateNoticeState;
  updateOutcome: UpdateOutcomeState;
  checkingForUpdate: boolean;
  updateCheckResult: string;
  checkForUpdateNow: () => void;
  changeUpdateCheckEnabled: (enabled: boolean) => void;

  // Advanced
  logLevel: string;
  changeLogLevel: (level: string) => void;
}

export function useSettingsPage(prompts: SettingsPrompts, pendingEdits: PendingEdits = {}): SettingsPageState {
  // A ref, so the first load reads the carry without making it a dependency.
  const pending = useRef(pendingEdits);
  // Connection state
  const [url, setUrl] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState("");
  const [allowInsecureSsl, setAllowInsecureSsl] = useState(false);
  const [customHeaderNames, setCustomHeaderNames] = useState<string[]>([]);

  // SteamGridDB state
  const [sgdbApiKey, setSgdbApiKey] = useState("");

  // Save Sync state
  const [saveSyncSettings, setSaveSyncSettings] = useState<SaveSyncSettings | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ device_id: string; device_name: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  // Registered devices state
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[] | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  // Controller state
  const [steamInputMode, setSteamInputMode] = useState("default");
  const [steamInputStatus, setSteamInputStatus] = useState("");
  const [applyingSteamInput, setApplyingSteamInput] = useState(false);
  const [retroarchWarning, setRetroarchWarning] = useState<RetroArchInputCheck | null>(null);
  const [retroarchFixStatus, setRetroarchFixStatus] = useState("");

  // Advanced state
  const [logLevel, setLogLevel] = useState("warn");

  // Updates state
  const update = useUpdateNoticeState();
  const updateOutcome = useUpdateOutcomeState();
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState("");

  // Library state (preferred sibling-group region, ADR-0021)
  const [preferredRegion, setPreferredRegion] = useState(AUTO_REGION);
  const [libraryRegions, setLibraryRegions] = useState<string[]>([]);
  const [platformGroups, setPlatformGroups] = useState(false);
  // Steam-collection naming mode: "merge" (default) or "by_label".
  const [namingMode, setNamingMode] = useState<CollectionNamingMode>("merge");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setUrl(pending.current.url ?? s.romm_url);
        setHasToken(s.has_token);
        setAllowInsecureSsl(s.romm_allow_insecure_ssl);
        setCustomHeaderNames(s.romm_custom_header_names ?? []);
        setSgdbApiKey(s.sgdb_api_key_masked);
        setSteamInputMode(s.steam_input_mode);
        setLogLevel(s.log_level);
        setPreferredRegion(s.preferred_region ?? AUTO_REGION);
        setPlatformGroups(!!s.collection_create_platform_groups);
        setNamingMode(s.collection_naming_mode ?? "merge");
        if (s.retroarch_input_check) {
          setRetroarchWarning(s.retroarch_input_check);
        }
      })
      .catch((e) => {
        logError(`Failed to load settings: ${e}`);
        setStatus("Failed to load settings");
      });

    // Failure degrades the Preferred-region options to the anchors only.
    getKnownRegions()
      .then((regions) => setLibraryRegions(regions))
      .catch(() => {});

    getSaveSyncSettings()
      .then((settings) => {
        setSaveSyncSettings(settings);
        if (settings.save_sync_enabled) {
          ensureDeviceRegistered()
            .then((result) => {
              if (result.success) {
                setDeviceInfo({ device_id: result.device_id, device_name: result.device_name });
              }
            })
            .catch(() => {});
          loadDevices();
        }
      })
      .catch((e) => logError(`Failed to load save sync settings: ${e}`));
  }, []);

  function loadDevices() {
    setDevicesLoading(true);
    setDevicesError(null);
    listDevices()
      .then((result) => {
        if (result.success) {
          setRegisteredDevices(result.devices);
        } else if (result.disabled) {
          setRegisteredDevices(null);
        } else {
          setDevicesError(result.message ?? "Failed to load devices");
          setRegisteredDevices([]);
        }
      })
      .catch((e: unknown) => {
        setDevicesError(e instanceof Error ? e.message : "Failed to load devices");
        setRegisteredDevices([]);
      })
      .finally(() => {
        setDevicesLoading(false);
      });
  }

  const handleSaveSyncSettingChange = async (partial: Partial<SaveSyncSettings>) => {
    if (!saveSyncSettings) return;
    const updated = { ...saveSyncSettings, ...partial };
    setSaveSyncSettings(updated);
    try {
      await updateSaveSyncSettings(updated);
      if ("save_sync_enabled" in partial) {
        // On SharedJSContext's global, where every listener of it lives.
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", {
            detail: { type: "save_sync_settings", save_sync_enabled: updated.save_sync_enabled },
          }),
        );
        if (updated.save_sync_enabled) {
          loadDevices();
        } else {
          setRegisteredDevices(null);
          setDevicesError(null);
        }
      }
    } catch (e) {
      logError(`Failed to save settings: ${e}`);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncStatus("");
    try {
      const result = await syncAllSaves();
      setSyncStatus(result.message);
      globalThis.dispatchEvent(new CustomEvent("romm_data_changed", { detail: { type: "save_sync" } }));
    } catch {
      setSyncStatus("Sync failed");
    }
    setSyncing(false);
  };

  const handleEnableSaveSync = async () => {
    if (await prompts.confirmEnableSaveSync()) {
      await handleSaveSyncSettingChange({ save_sync_enabled: true });
    }
  };

  const handleToggleSaveSync = (value: boolean) => {
    // NOSONAR sits on the if-statement line; prettier-ignore keeps the one-liner intact so the
    // suppression isn't relocated to the closing brace (which would break it).
    // prettier-ignore
    if (value) { detach(handleEnableSaveSync()); } else { detach(handleSaveSyncSettingChange({ save_sync_enabled: false })); } // NOSONAR — enable asks first
  };

  // --- Connection handlers ---
  const handleUrlChange = async (value: string) => {
    const trimmed = trimServerUrl(value);
    setUrl(trimmed);
    try {
      if (!isValidServerUrl(trimmed)) {
        setStatus(INVALID_URL_MESSAGE);
        return;
      }
      await saveServerUrl(trimmed, allowInsecureSsl);
    } catch {
      setStatus("Failed to save settings");
    } finally {
      // The pending value exists to carry an edit across the remount closing
      // the editor can cause, not to outlive the attempt: left behind, a value
      // the backend refused is what every later open of the page shows in the
      // field, over the URL actually saved (#1020).
      delete pending.current.url;
    }
  };
  // The editor owns closing (on success) and error display (on failure), so the
  // verdict — and a rejection — is handed straight back to it rather than caught
  // here. Only the row's own count is updated, from the list that was accepted.
  //
  // Trimmed, because the backend stores a name stripped of its surrounding
  // whitespace: taking the sent spelling would leave the row showing "  X-Token  "
  // until the next settings read, over a header stored as "X-Token".
  const handleSaveCustomHeaders = async (headers: CustomHeaderEntry[]) => {
    const result = await saveCustomHeaders(headers);
    if (result.success) {
      setCustomHeaderNames(headers.map((h) => h.name.trim()));
    }
    return result;
  };
  const handleAllowInsecureSslChange = (val: boolean) => {
    setAllowInsecureSsl(val);
    // Auto-save the URL with the new SSL setting
    saveServerUrl(url, val).catch(() => {
      setStatus("Failed to save settings");
    });
  };
  // The sign-in prompt owns closing (on success) and error display (on
  // failure). The status line is only touched on success — a post-close
  // confirmation — so a failed sign-in shows its message inside the still-open
  // prompt, never on the line.
  const handleSignIn = async (request: SignInRequest): Promise<SignInResult> => {
    const result = await signInToRomm(url, allowInsecureSsl, request);
    if (result.success) {
      setHasToken(true);
      setStatus(result.message);
    }
    return result;
  };
  const handleSignOut = async () => {
    setStatus("");
    try {
      const result = await signOut();
      setStatus(result.message);
      if (result.success) {
        setHasToken(false);
      }
    } catch {
      setStatus("Sign-out failed");
    }
  };

  // The prompt saves only a key that verified (utils/sgdbApiKey.ts), and never
  // an empty one, so a successful save means a configured key — reflect it as
  // the masked display.
  const handleSaveSgdbKey = async (value: string) => {
    await saveSgdbApiKey(value);
    setSgdbApiKey("set");
  };

  // --- Save-sync default-slot handlers ---
  const handleResetDefaultSlot = () => {
    setSaveSyncSettings((prev) => (prev ? { ...prev, default_slot: "default" } : prev));
    detach(handleSaveSyncSettingChange({ default_slot: "default" }));
    showToast('Default save slot reset to "default".');
  };
  const handleDefaultSlotSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      setSaveSyncSettings((prev) => (prev ? { ...prev, default_slot: trimmed } : prev));
      detach(handleSaveSyncSettingChange({ default_slot: trimmed }));
    } else {
      handleResetDefaultSlot();
    }
  };

  // --- Controller handlers ---
  const handleSteamInputModeChange = (mode: string) => {
    setSteamInputMode(mode);
    detach(saveSteamInputSetting(mode));
    setSteamInputStatus("");
  };
  const handleApplySteamInput = async () => {
    // A second press while the first run is in flight is refused rather than
    // queued: the run walks every shortcut Steam holds and two of them
    // interleave their writes, and the button says so while it is dead (#1020).
    // The guard is here rather than only on the button because a press is
    // delivered on activate, and a disabled control still reports one on the
    // device.
    if (applyingSteamInput) return;
    setApplyingSteamInput(true);
    setSteamInputStatus("Applying...");
    try {
      const result = await applySteamInputSetting();
      setSteamInputStatus(result.message);
    } catch {
      setSteamInputStatus("Failed to apply");
    } finally {
      setApplyingSteamInput(false);
    }
  };
  const handleFixInputDriver = async () => {
    setRetroarchFixStatus("Applying...");
    try {
      const result = await fixRetroarchInputDriver();
      setRetroarchFixStatus(result.message);
      if (result.success) {
        setRetroarchWarning(null);
      }
    } catch {
      setRetroarchFixStatus("Failed to apply fix");
    }
  };

  // --- Advanced handlers ---
  const handleLogLevelChange = (level: string) => {
    setLogLevel(level);
    detach(saveLogLevel(level));
  };

  // --- Updates handlers ---
  const handleCheckForUpdateNow = async () => {
    // Refused rather than queued, and in the handler rather than only on the
    // button: a disabled control still reports a press on the device.
    if (checkingForUpdate) return;
    setCheckingForUpdate(true);
    setUpdateCheckResult("");
    try {
      const outcome = await runUpdateCheckNow();
      if (outcome !== "superseded") {
        setUpdateCheckResult(CHECK_OUTCOME_LINES[outcome]);
      }
    } catch (e) {
      logError(`Failed to check for updates: ${e}`);
      setUpdateCheckResult("The check failed.");
    } finally {
      setCheckingForUpdate(false);
    }
  };
  const handleUpdateCheckEnabledChange = (enabled: boolean) => {
    setUpdateCheckResult("");
    setUpdateCheckSwitch(enabled).catch((e) => logError(`Failed to save the update check switch: ${e}`));
  };

  // --- Library handlers ---
  const handlePreferredRegionChange = (region: string) => {
    if (region === preferredRegion) return;
    // Explain the apply-at-next-sync / no-retroactive-rename semantics before
    // persisting. Confirm saves + updates the dropdown; cancel leaves the state
    // (and therefore the dropdown selection) unchanged.
    detach(
      (async () => {
        const proceed = await prompts.confirmPreferredRegion(regionLabel(preferredRegion), regionLabel(region));
        if (proceed) {
          setPreferredRegion(region);
          detach(savePreferredRegion(region));
        }
      })(),
    );
  };

  const handlePlatformGroupsChange = (value: boolean) => {
    setPlatformGroups(value);
    detach(
      (async () => {
        try {
          await saveCollectionPlatformGroups(value);
        } catch {
          setPlatformGroups(!value);
        }
      })(),
    );
  };

  const handleNamingModeChange = (mode: CollectionNamingMode) => {
    const previous = namingMode;
    setNamingMode(mode);
    detach(
      (async () => {
        try {
          await setCollectionNamingMode(mode);
        } catch {
          setNamingMode(previous);
        }
      })(),
    );
  };

  return {
    url,
    hasToken,
    status,
    allowInsecureSsl,
    customHeaderNames,
    sgdbApiKey,
    saveUrl: (value: string) => detach(handleUrlChange(value)),
    saveCustomHeaders: handleSaveCustomHeaders,
    setAllowInsecureSsl: handleAllowInsecureSslChange,
    signIn: handleSignIn,
    signOut: () => detach(handleSignOut()),
    saveSgdbKey: handleSaveSgdbKey,

    saveSyncSettings,
    deviceInfo,
    syncing,
    syncStatus,
    registeredDevices,
    devicesLoading,
    devicesError,
    changeSaveSyncSetting: (partial: Partial<SaveSyncSettings>) => detach(handleSaveSyncSettingChange(partial)),
    toggleSaveSync: handleToggleSaveSync,
    submitDefaultSlot: handleDefaultSlotSubmit,
    resetDefaultSlot: handleResetDefaultSlot,
    syncAll: () => detach(handleSyncAll()),

    steamInputMode,
    steamInputStatus,
    applyingSteamInput,
    retroarchWarning,
    retroarchFixStatus,
    changeSteamInputMode: handleSteamInputModeChange,
    applySteamInput: () => detach(handleApplySteamInput()),
    fixInputDriver: () => detach(handleFixInputDriver()),

    preferredRegion,
    libraryRegions,
    platformGroups,
    namingMode,
    changePreferredRegion: handlePreferredRegionChange,
    changePlatformGroups: handlePlatformGroupsChange,
    changeNamingMode: handleNamingModeChange,

    update,
    updateOutcome,
    checkingForUpdate,
    updateCheckResult,
    checkForUpdateNow: () => detach(handleCheckForUpdateNow()),
    changeUpdateCheckEnabled: handleUpdateCheckEnabledChange,

    logLevel,
    changeLogLevel: handleLogLevelChange,
  };
}
