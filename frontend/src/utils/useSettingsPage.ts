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
  removeSgdbApiKey,
  saveSgdbApiKey,
  saveSteamInputSetting,
  setCollectionNamingMode,
  signOut,
  syncAllSaves,
  updateSaveSyncSettings,
} from "../api/backend";
import type { CollectionNamingMode, CustomHeaderEntry, RegisteredDevice, SaveSyncSettings } from "../types";
import type { SaveHeadersResult } from "./customHeaders";
import { detach } from "./detach";
import { AUTO_REGION, regionLabel } from "./preferredRegion";
import { SAVE_FAILED, SYNC_ALL_FAILED_STATUS } from "./settingsWording";
import { signInToRomm, type SignInRequest, type SignInResult } from "./rommSignIn";
import { trimServerUrl } from "./serverUrl";
import { REMOVE_KEY_FAILED, SgdbKeySaveRefused } from "./sgdbApiKey";
import { showToast } from "./toast";
import { useUpdateOutcomeState, type UpdateOutcomeState } from "./updateOutcomeStore";
import { CHECK_OUTCOME_LINES, UPDATE_CHECK_FAILED } from "./updateAvailableView";
import {
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

export interface SettingsPageState {
  // Connections
  url: string;
  hasToken: boolean;
  /** The Connections section's one status line: what loading, signing in or out, and the SSL switch's save said. */
  status: string;
  /** Whether {@link status} reports a refusal or a failure. */
  statusWarns: boolean;
  allowInsecureSsl: boolean;
  /** Names only — a configured header's value is a proxy credential the backend never sends back. */
  customHeaderNames: string[];
  /** Truthy once a key is configured; never the key. */
  sgdbApiKey: string;
  /**
   * Saves the RomM URL and answers what the backend said, for the editor to show
   * a refusal or a failure itself; only an accepted save reaches this state.
   */
  saveUrl: (value: string) => Promise<{ success: boolean; message: string }>;
  saveCustomHeaders: (headers: CustomHeaderEntry[]) => Promise<SaveHeadersResult>;
  setAllowInsecureSsl: (value: boolean) => void;
  signIn: (request: SignInRequest) => Promise<SignInResult>;
  signOut: () => void;
  saveSgdbKey: (value: string) => Promise<void>;
  removeSgdbKey: () => Promise<void>;

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
  changeSteamInputMode: (mode: string) => void;
  applySteamInput: () => void;

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

const NO_STATUS = { text: "", warns: false } as const;

export function useSettingsPage(prompts: SettingsPrompts): SettingsPageState {
  // Connection state
  const [url, setUrl] = useState("");
  // The SSL flag the backend holds, which the switch goes back to when it
  // refuses a save; null until the settings have loaded.
  const storedSsl = useRef<boolean | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [statusLine, setStatusLine] = useState<{ text: string; warns: boolean }>(NO_STATUS);
  const setStatus = (text: string, warns = false) => setStatusLine({ text, warns });
  // What the SSL switch's save last put on the status line, the one message an
  // accepted save may clear: the line also carries what loading and signing in said.
  const saveStatus = useRef<string | null>(null);
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
        storedSsl.current = s.romm_allow_insecure_ssl;
        setUrl(s.romm_url);
        setHasToken(s.has_token);
        // While signed in, whether save sync is on or off: the play-session
        // upload sends the device id too.
        if (s.has_token) {
          ensureDeviceRegistered()
            .then((result) => {
              if (result.success) {
                setDeviceInfo({ device_id: result.device_id, device_name: result.device_name });
              }
            })
            .catch(() => {});
        }
        setAllowInsecureSsl(s.romm_allow_insecure_ssl);
        setCustomHeaderNames(s.romm_custom_header_names ?? []);
        setSgdbApiKey(s.sgdb_api_key_masked);
        setSteamInputMode(s.steam_input_mode);
        setLogLevel(s.log_level);
        setPreferredRegion(s.preferred_region ?? AUTO_REGION);
        setPlatformGroups(!!s.collection_create_platform_groups);
        setNamingMode(s.collection_naming_mode ?? "merge");
      })
      .catch((e) => {
        logError(`Failed to load settings: ${e}`);
        setStatus("Failed to load settings", true);
      });

    // Failure degrades the Preferred-region options to the anchors only.
    getKnownRegions()
      .then((regions) => setLibraryRegions(regions))
      .catch(() => {});

    getSaveSyncSettings()
      .then((settings) => {
        setSaveSyncSettings(settings);
        if (settings.save_sync_enabled) {
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
          setDevicesError(result.message);
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
          ensureDeviceRegistered()
            .then((result) => {
              if (result.success) {
                setDeviceInfo({ device_id: result.device_id, device_name: result.device_name });
              }
            })
            .catch(() => {});
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
      setSyncStatus(SYNC_ALL_FAILED_STATUS);
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
  const showSaveStatus = (message: string) => {
    saveStatus.current = message;
    setStatus(message, true);
  };
  const clearSaveStatus = () => {
    const shown = saveStatus.current;
    saveStatus.current = null;
    if (shown !== null) setStatusLine((current) => (current.text === shown ? NO_STATUS : current));
  };
  const handleSaveUrl = async (value: string): Promise<{ success: boolean; message: string }> => {
    const trimmed = trimServerUrl(value);
    const sentSsl = allowInsecureSsl;
    try {
      const result = await saveServerUrl(trimmed, sentSsl);
      if (result.success) {
        storedSsl.current = sentSsl;
        setUrl(trimmed);
        setAllowInsecureSsl(sentSsl);
        clearSaveStatus();
      }
      return result;
    } catch {
      return { success: false, message: SAVE_FAILED };
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
    const before = allowInsecureSsl;
    setAllowInsecureSsl(val);
    // Auto-save the URL with the new SSL setting
    saveServerUrl(url, val)
      .then((result) => {
        if (result.success) {
          storedSsl.current = val;
          setAllowInsecureSsl(val);
          clearSaveStatus();
          return;
        }
        setAllowInsecureSsl(storedSsl.current ?? before);
        showSaveStatus(result.message);
      })
      .catch(() => {
        showSaveStatus(SAVE_FAILED);
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
      setStatus(result.message, !result.success);
      if (result.success) {
        setHasToken(false);
      }
    } catch {
      setStatus("Sign-out failed", true);
    }
  };

  // The prompt saves only a key that verified (utils/sgdbApiKey.ts), and never
  // an empty one, so a successful save means a configured key — reflect it as
  // the masked display.
  const handleSaveSgdbKey = async (value: string) => {
    const result = await saveSgdbApiKey(value);
    if (!result.success) throw new SgdbKeySaveRefused(result.message);
    setSgdbApiKey("set");
  };
  const handleRemoveSgdbKey = async () => {
    try {
      const result = await removeSgdbApiKey();
      if (result.success) setSgdbApiKey("");
      else showToast(result.message);
    } catch (e) {
      logError(`Failed to remove the SteamGridDB API key: ${e}`);
      showToast(REMOVE_KEY_FAILED);
    }
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

  // --- Advanced handlers ---
  const handleLogLevelChange = (level: string) => {
    const previous = logLevel;
    setLogLevel(level);
    detach(
      (async () => {
        try {
          const result = await saveLogLevel(level);
          if (!result.success) {
            setLogLevel(previous);
          }
        } catch {
          setLogLevel(previous);
        }
      })(),
    );
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
      setUpdateCheckResult(UPDATE_CHECK_FAILED);
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
    status: statusLine.text,
    statusWarns: statusLine.warns,
    allowInsecureSsl,
    customHeaderNames,
    sgdbApiKey,
    saveUrl: handleSaveUrl,
    saveCustomHeaders: handleSaveCustomHeaders,
    setAllowInsecureSsl: handleAllowInsecureSslChange,
    signIn: handleSignIn,
    signOut: () => detach(handleSignOut()),
    saveSgdbKey: handleSaveSgdbKey,
    removeSgdbKey: handleRemoveSgdbKey,

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
    changeSteamInputMode: handleSteamInputModeChange,
    applySteamInput: () => detach(handleApplySteamInput()),

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
