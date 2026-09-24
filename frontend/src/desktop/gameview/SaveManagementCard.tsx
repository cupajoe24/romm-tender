/**
 * SaveManagementCard — save slot browser and manager for the Desktop game view.
 *
 * Appears first in the "Emulation Settings" tab. Functionally equivalent to
 * Big Picture SavesTab, styled to match Steam Desktop UI cards:
 * - Active slot expanded by default, inactive slots collapsed.
 * - Accordion slot rows with ACTIVE, SERVER / LOCAL badges and sync summaries.
 * - Active slot shows tracked save files, metadata, local path, and previous versions.
 * - Previous versions table with rollback ([Restore]) and [Copy to slot...].
 * - Inactive slot body lazy-loads saves on first expand, with Activate and Delete.
 * - Manual [Sync now] and [+ New Slot] in the header.
 * - Clean desktop dialogs for new slot, copy to slot, and delete confirmation.
 */

import { useState, useEffect, useCallback, type FC } from "react";
import {
  getSaveSlots,
  getSlotSaves,
  switchSlot,
  deleteSlot,
  getSlotDeleteInfo,
  syncRomSaves,
  copySaveToSlot,
  savesListFileVersions,
  savesRollbackToVersion,
  getVersionList,
  checkLocalDrift,
  debugLog,
} from "../../api/backend";
import { useRommConnectionState, reportServerReachable } from "../../utils/connectionState";
import { refreshSaveStatus, noteSaveSyncDisplay, type GameDetailState } from "../../utils/gameDetailStore";
import { showToast } from "../../utils/toast";
import { saveSyncToastBody } from "../../utils/saveSyncToast";
import { detach } from "../../utils/detach";
import { formatBytes, formatTimestamp } from "../../utils/formatters";
import {
  displaySlot,
  formatRelativeTime,
  pickLastSyncer,
  formatAttributionSegment,
  slotDeleteFailureToast,
  statusLabel,
  computeSyncSummary,
  MUTED_COLOR,
} from "../../utils/saveHelpers";
import type {
  SaveSlotSummary,
  SlotSaveFile,
  SaveVersionEntry,
  SyncConflict,
  SlotDeleteInfo,
  CopySaveToSlotStatus,
  RollbackStatus,
} from "../../types";

export interface SaveManagementCardProps {
  appId: number;
  romId: number | null;
  detail: GameDetailState;
}

import { CARD_STYLE, BUTTON_STYLE, MODAL_CONTAINER_STYLE, BACKDROP_BUTTON_STYLE } from "./styles";

const DIALOG_BOX_STYLE: React.CSSProperties = {
  backgroundColor: "#1b2838",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: "4px",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8)",
  padding: "20px 24px",
  minWidth: "360px",
  maxWidth: "480px",
  color: "#c7d5e0",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

export const SaveManagementCard: FC<SaveManagementCardProps> = ({ appId, romId, detail }) => {
  const [availableSlots, setAvailableSlots] = useState<SaveSlotSummary[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(Boolean(romId));
  const [activeSlotKnown, setActiveSlotKnown] = useState(false);
  const connectionState = useRommConnectionState();
  const isOffline = connectionState === "offline";
  const [isSyncing, setIsSyncing] = useState(false);
  const [strandedVersion, setStrandedVersion] = useState<string | null>(null);

  // Expanded state map for accordion slots
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});

  // Inactive slots lazy-loaded saves cache
  const [slotSavesCache, setSlotSavesCache] = useState<Record<string, SlotSaveFile[]>>({});
  const [loadingSlotSaves, setLoadingSlotSaves] = useState<Record<string, boolean>>({});
  const [slotSwitchErrors, setSlotSwitchErrors] = useState<Record<string, string | null>>({});

  // Modals state
  const [showNewSlotModal, setShowNewSlotModal] = useState(false);
  const [newSlotInput, setNewSlotInput] = useState("");
  const [newSlotError, setNewSlotError] = useState<string | null>(null);

  const [copyModalData, setCopyModalData] = useState<{ saveId: number; sourceSlot: string } | null>(null);
  const [copyNewSlotInput, setCopyNewSlotInput] = useState("");

  const [deleteModalSlot, setDeleteModalSlot] = useState<SlotDeleteInfo | null>(null);

  // Version history sub-panels expansion & cache
  const [versionHistoryExpanded, setVersionHistoryExpanded] = useState<Record<string, boolean>>({});
  const [versionHistoryCache, setVersionHistoryCache] = useState<Record<string, SaveVersionEntry[]>>({});
  const [versionHistoryLoading, setVersionHistoryLoading] = useState<Record<string, boolean>>({});
  const [restoringVersionId, setRestoringVersionId] = useState<number | null>(null);

  // Active slot determination
  const activeSlot = detail.activeSlot;
  const saveStatus = detail.saveStatus;
  const conflicts: SyncConflict[] = saveStatus?.conflicts ?? [];

  // Fetch slots list
  const loadSlots = useCallback(async () => {
    if (!romId) return;
    try {
      const result = await getSaveSlots(romId);
      if (result.success) {
        reportServerReachable(true);
        setAvailableSlots(result.slots);
        setActiveSlotKnown(result.active_slot !== null);
      } else {
        if (result.reason === "server_unreachable") {
          reportServerReachable(false);
        }
        if (result.last_known?.slots) {
          setAvailableSlots(result.last_known.slots);
        }
      }
    } catch (e) {
      detach(debugLog(`SaveManagementCard: failed to load save slots: ${e}`));
    } finally {
      setSlotsLoading(false);
    }
  }, [romId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async data loads on mount are the standard React pattern; the rule is overzealous here
    detach(loadSlots());
  }, [loadSlots]);

  // Stranded versions check (#1298)
  useEffect(() => {
    if (!romId) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const check = async () => {
      try {
        const list = await getVersionList(appId);
        if (isCancelled()) return;
        const inactiveInstalled = list.multi_version
          ? (list.versions ?? []).filter((v) => v.installed && !v.active && !v.vanished)
          : [];
        let stranded: string | null = null;
        for (const v of inactiveInstalled) {
          const drift = await checkLocalDrift(v.rom_id);
          if (isCancelled()) return;
          if (drift.drifted) {
            stranded = v.label || v.name || String(v.rom_id);
            break;
          }
        }
        setStrandedVersion(stranded);
      } catch (e) {
        if (!isCancelled()) setStrandedVersion(null);
        detach(debugLog(`SaveManagementCard: stranded-version check failed for appId ${appId}: ${e}`));
      }
    };
    detach(check());
    return () => {
      cancelled = true;
    };
  }, [appId, romId]);

  // React to romm_data_changed
  useEffect(() => {
    const handleDataChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ type?: string; rom_id?: number }>;
      if (
        customEvent.detail.type === "save_sync" &&
        (!customEvent.detail.rom_id || customEvent.detail.rom_id === romId)
      ) {
        detach(loadSlots());
        detach(refreshSaveStatus(appId));
        // Invalidate version histories
        setVersionHistoryCache({});
      }
    };
    globalThis.addEventListener("romm_data_changed", handleDataChanged);
    return () => globalThis.removeEventListener("romm_data_changed", handleDataChanged);
  }, [appId, romId, loadSlots]);

  // Toggle slot expansion
  const toggleSlotExpanded = (slotName: string, isSlotActive: boolean) => {
    const currentlyExpanded = expandedSlots[slotName] ?? isSlotActive;
    const willExpand = !currentlyExpanded;
    setExpandedSlots((prev) => ({ ...prev, [slotName]: willExpand }));

    // Lazy load inactive slot files
    if (willExpand && !isSlotActive && !slotSavesCache[slotName] && romId) {
      setLoadingSlotSaves((prev) => ({ ...prev, [slotName]: true }));
      getSlotSaves(romId, slotName)
        .then((res) => {
          setSlotSavesCache((prev) => ({ ...prev, [slotName]: res.success ? res.saves : [] }));
        })
        .catch((e) => {
          detach(debugLog(`SaveManagementCard: failed to load slot saves for ${slotName}: ${e}`));
          setSlotSavesCache((prev) => ({ ...prev, [slotName]: [] }));
        })
        .finally(() => {
          setLoadingSlotSaves((prev) => ({ ...prev, [slotName]: false }));
        });
    }
  };

  // Toggle version history expansion
  const toggleVersionHistory = (slotName: string, filename: string) => {
    const key = `${slotName}-${filename}`;
    const willExpand = !versionHistoryExpanded[key];
    setVersionHistoryExpanded((prev) => ({ ...prev, [key]: willExpand }));

    if (willExpand && !versionHistoryCache[key] && romId) {
      setVersionHistoryLoading((prev) => ({ ...prev, [key]: true }));
      savesListFileVersions(romId, slotName, filename)
        .then((res) => {
          if (res.status === "ok" || res.status === "multi_file_unsupported") {
            setVersionHistoryCache((prev) => ({ ...prev, [key]: res.versions }));
          } else {
            setVersionHistoryCache((prev) => ({ ...prev, [key]: [] }));
          }
        })
        .catch((e) => {
          detach(debugLog(`SaveManagementCard: failed to load versions for ${filename}: ${e}`));
          setVersionHistoryCache((prev) => ({ ...prev, [key]: [] }));
        })
        .finally(() => {
          setVersionHistoryLoading((prev) => ({ ...prev, [key]: false }));
        });
    }
  };

  // Manual "Sync now" action
  const handleSyncNow = async () => {
    if (isSyncing || !romId) return;
    setIsSyncing(true);
    try {
      const result = await syncRomSaves(romId);
      if (result.success) {
        const body = saveSyncToastBody(result.uploaded, result.downloaded);
        const c = result.conflicts?.length ?? 0;
        if (body) {
          showToast(body);
        } else if (c === 0) {
          showToast("Saves already up to date");
        }
        if (c > 0) {
          showToast(`${c} conflict(s) need resolution`);
        }
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
        noteSaveSyncDisplay(appId, romId, { status: "synced", label: "Just now", last_sync_check_at: null });
        await refreshSaveStatus(appId);
        await loadSlots();
      } else {
        showToast(result.message || "Save sync failed");
      }
    } catch {
      showToast("Save sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // New slot submit
  const handleCreateSlot = async () => {
    const name = newSlotInput.trim();
    if (!name || !romId) return;
    try {
      const result = await switchSlot(romId, name);
      if (result.success && result.save_status) {
        reportServerReachable(true);
        showToast(`Switched to slot '${name}'`);
        setShowNewSlotModal(false);
        setNewSlotInput("");
        setNewSlotError(null);
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
        await refreshSaveStatus(appId);
        await loadSlots();
      } else {
        let msg = "Failed to create slot";
        if (result.reason === "pending_uploads") {
          msg = "Sync your saves first — local changes haven't been uploaded";
        } else if (result.reason === "server_unreachable") {
          reportServerReachable(false);
          msg = "Can't switch — RomM server is not reachable";
        }
        setNewSlotError(msg);
      }
    } catch (e) {
      detach(debugLog(`SaveManagementCard: new slot error: ${e}`));
      setNewSlotError("An error occurred while creating the slot");
    }
  };

  // Switch slot handler
  const handleActivateSlot = async (slotName: string) => {
    if (!romId) return;
    setSlotSwitchErrors((prev) => ({ ...prev, [slotName]: null }));
    try {
      const result = await switchSlot(romId, slotName);
      if (result.success && result.save_status) {
        reportServerReachable(true);
        showToast(`Switched to slot '${slotName}'`);
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
        await refreshSaveStatus(appId);
        await loadSlots();
      } else {
        let msg = "Failed to switch slot";
        if (result.reason === "pending_uploads") {
          msg = "Sync your saves first — local changes haven't been uploaded";
        } else if (result.reason === "server_unreachable") {
          reportServerReachable(false);
          msg = "Can't switch — RomM server is not reachable";
        } else if (result.reason === "not_installed") {
          msg = "Can't switch — download the game first";
        }
        setSlotSwitchErrors((prev) => ({ ...prev, [slotName]: msg }));
      }
    } catch (e) {
      detach(debugLog(`SaveManagementCard: switch slot error: ${e}`));
      setSlotSwitchErrors((prev) => ({ ...prev, [slotName]: "An error occurred while switching slots" }));
    }
  };

  // Delete slot pre-flight & confirmation
  const handlePromptDeleteSlot = async (slotName: string) => {
    if (!romId) return;
    try {
      const info: SlotDeleteInfo = await getSlotDeleteInfo(romId, slotName);
      if (!info.success) {
        showToast(slotDeleteFailureToast(info));
        return;
      }
      setDeleteModalSlot(info);
    } catch (e) {
      detach(debugLog(`SaveManagementCard: getSlotDeleteInfo error: ${e}`));
      showToast("Failed to load slot info");
    }
  };

  const handleConfirmDeleteSlot = async () => {
    if (!deleteModalSlot || !romId) return;
    const slotName = deleteModalSlot.slot;
    if (!slotName) return;
    try {
      const result = await deleteSlot(romId, slotName);
      if (result.success) {
        showToast(`Slot '${slotName}' deleted`);
        setDeleteModalSlot(null);
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
        await refreshSaveStatus(appId);
        await loadSlots();
      } else {
        showToast(result.message ?? "Failed to delete slot");
      }
    } catch (e) {
      detach(debugLog(`SaveManagementCard: deleteSlot error: ${e}`));
      showToast("An error occurred while deleting the slot");
    }
  };

  // Copy to slot submission
  const handleExecuteCopy = async (target: string) => {
    if (!copyModalData || !romId) return;
    const { saveId } = copyModalData;
    try {
      const result: CopySaveToSlotStatus = await copySaveToSlot(romId, saveId, target);
      if (result.status === "ok") {
        showToast(`Save copied to slot '${displaySlot(target)}'`);
        setCopyModalData(null);
        setCopyNewSlotInput("");
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
        await refreshSaveStatus(appId);
        await loadSlots();
      } else if (result.status === "already_present") {
        showToast(`Already in slot '${displaySlot(target)}' as #${result.existing_id}`);
        setCopyModalData(null);
      } else if (result.status === "target_slot_busy") {
        showToast(`Slot '${displaySlot(target)}' has newer changes on another device — sync it first.`);
      } else {
        showToast(`Could not copy save: ${result.status}`);
      }
    } catch (e) {
      detach(debugLog(`SaveManagementCard: copy error: ${e}`));
      showToast("Couldn't copy the save. Check your connection.");
    }
  };

  // Version rollback
  const handleRestoreVersion = async (slotName: string, version: SaveVersionEntry) => {
    if (!romId) return;
    setRestoringVersionId(version.id);
    try {
      const result: RollbackStatus = await savesRollbackToVersion(romId, slotName, version.id);
      if (result.status === "ok") {
        showToast(`Save restored from ${formatRelativeTime(version.updated_at)}`);
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
        await refreshSaveStatus(appId);
        await loadSlots();
      } else if (result.status === "put_failed") {
        showToast("Restored locally, but server update failed. Try syncing again.");
        globalThis.dispatchEvent(
          new CustomEvent("romm_data_changed", { detail: { type: "save_sync", rom_id: romId } }),
        );
      } else {
        showToast(`Restore blocked: ${result.status}`);
      }
    } catch (e) {
      detach(debugLog(`SaveManagementCard: restore error: ${e}`));
      showToast("An error occurred while restoring the save");
    } finally {
      setRestoringVersionId(null);
    }
  };

  // Sort slots: active first, then alphabetical, legacy "" last
  const slotRank = (s: SaveSlotSummary): number => {
    if (s.slot === activeSlot) return 0;
    if (s.slot === "") return 2;
    return 1;
  };
  const sortedSlots = [...availableSlots].sort((a, b) => {
    const diff = slotRank(a) - slotRank(b);
    if (diff !== 0) return diff;
    return a.slot.localeCompare(b.slot);
  });

  if (activeSlot && activeSlotKnown && !sortedSlots.some((s) => s.slot === activeSlot)) {
    sortedSlots.unshift({ slot: activeSlot, source: "local", count: 0, latest_updated_at: null });
  }

  const totalSlotsCount = sortedSlots.length;
  const syncLabel = detail.saveSyncEnabled ? "save sync on" : "save sync off";

  return (
    <div className="tender-desktop-card tender-desktop-saves-card" style={CARD_STYLE}>
      {/* Card Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          paddingBottom: "12px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}
          >
            Saves
          </h2>
          <span style={{ fontSize: "12px", color: MUTED_COLOR }}>
            {`${totalSlotsCount} slot${totalSlotsCount === 1 ? "" : "s"} · ${syncLabel}`}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            style={{
              ...BUTTON_STYLE,
              opacity: isSyncing || isOffline || !detail.saveSyncEnabled ? 0.6 : 1,
              cursor: isSyncing || isOffline || !detail.saveSyncEnabled ? "default" : "pointer",
            }}
            disabled={isSyncing || isOffline || !detail.saveSyncEnabled}
            onClick={() => void handleSyncNow()}
          >
            {isSyncing ? "Syncing..." : "Sync now"}
          </button>
          <button
            type="button"
            style={{
              ...BUTTON_STYLE,
              opacity: isOffline ? 0.6 : 1,
              cursor: isOffline ? "default" : "pointer",
            }}
            disabled={isOffline}
            onClick={() => {
              setNewSlotInput("");
              setNewSlotError(null);
              setShowNewSlotModal(true);
            }}
          >
            + New Slot
          </button>
        </div>
      </div>

      {/* Banners */}
      {isOffline && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(217, 65, 38, 0.15)",
            borderRadius: "4px",
            border: "1px solid rgba(217, 65, 38, 0.4)",
            marginBottom: "12px",
            fontSize: "12px",
            color: "#d94126",
          }}
        >
          RomM is offline — slot switching is disabled until the server is reachable. This prevents save sync conflicts.
        </div>
      )}

      {strandedVersion && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(255, 136, 0, 0.15)",
            borderRadius: "4px",
            border: "1px solid rgba(255, 136, 0, 0.3)",
            marginBottom: "12px",
            fontSize: "12px",
            color: "#ff8800",
          }}
        >
          {`Version "${strandedVersion}" has saves that were never uploaded — switch back to sync them.`}
        </div>
      )}

      {activeSlot === null && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(255, 136, 0, 0.15)",
            borderRadius: "4px",
            border: "1px solid rgba(255, 136, 0, 0.3)",
            marginBottom: "12px",
            fontSize: "12px",
            color: "#ff8800",
          }}
        >
          This game uses legacy mode (no slot). Only one save version per game is supported.
        </div>
      )}

      {/* Slots Loading Indicator */}
      {slotsLoading && (
        <div style={{ padding: "12px 0", fontSize: "13px", color: MUTED_COLOR, fontStyle: "italic" }}>
          Connecting to RomM…
        </div>
      )}

      {/* Slot Accordion Panels */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {sortedSlots.map((slot) => {
          const isSlotActive = activeSlot !== null && slot.slot === activeSlot;
          const isExpanded = expandedSlots[slot.slot] ?? isSlotActive;
          const isLegacy = slot.slot === "";
          const cachedInactiveSaves = slotSavesCache[slot.slot];
          const fileCount = isSlotActive
            ? slot.count || (saveStatus?.files.length ?? 0)
            : (cachedInactiveSaves?.length ?? slot.count);

          const { syncSummaryText, syncSummaryColor } = computeSyncSummary(isSlotActive, saveStatus, conflicts);

          return (
            <div
              key={`slot-panel-${slot.slot}`}
              style={{
                backgroundColor: isSlotActive ? "rgba(0, 0, 0, 0.22)" : "rgba(0, 0, 0, 0.14)",
                borderRadius: "3px",
                border: isSlotActive ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.05)",
                overflow: "hidden",
              }}
            >
              {/* Slot Header */}
              <div
                role="button"
                tabIndex={0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  cursor: "pointer",
                  userSelect: "none",
                  backgroundColor: "transparent",
                  transition: "background-color 0.15s ease",
                }}
                onClick={() => toggleSlotExpanded(slot.slot, isSlotActive)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSlotExpanded(slot.slot, isSlotActive);
                  }
                }}
              >
                {/* Left: Chevron + Name + Badges */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#8f98a0", width: "12px" }}>{isExpanded ? "▾" : "▸"}</span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: isSlotActive ? "#ffffff" : "#dfe3e6",
                    }}
                  >
                    {displaySlot(slot.slot)}
                  </span>

                  {isSlotActive && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        backgroundColor: "#5ba32b",
                        color: "#ffffff",
                        padding: "1px 6px",
                        borderRadius: "2px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      ACTIVE
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: "#8f98a0",
                      padding: "1px 6px",
                      borderRadius: "2px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {slot.source === "local" ? "LOCAL" : "SERVER"}
                  </span>
                </div>

                {/* Right: Sync summary + Save count */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px" }}>
                  {isSlotActive && syncSummaryText && (
                    <span style={{ color: syncSummaryColor, fontWeight: 500 }}>{syncSummaryText}</span>
                  )}
                  <span style={{ color: "#8f98a0" }}>{`${fileCount} save(s)`}</span>
                </div>
              </div>

              {/* Slot Body (when expanded) */}
              {isExpanded && (
                <div
                  style={{
                    padding: "12px 16px 16px 34px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    fontSize: "13px",
                  }}
                >
                  {isSlotActive ? (
                    /* Active Slot Body */
                    <div>
                      {saveStatus?.files && saveStatus.files.length > 0 ? (
                        saveStatus.files.map((file) => {
                          const conflict = conflicts.find((c) => c.filename === file.filename);
                          const { color: statusColor, label: statusLabelText } = statusLabel(
                            file.status,
                            file.last_sync_at,
                          );
                          const isSynced = file.status === "synced" || file.status === "skip";
                          const lastSyncer = pickLastSyncer(file.device_syncs);
                          const attr = formatAttributionSegment(file.uploaded_by_us, lastSyncer?.device_name, isSynced);
                          const lastSyncedStr = [
                            file.last_sync_at ? formatRelativeTime(file.last_sync_at) || "Never" : "Never",
                            attr,
                            file.is_current === false ? "Newer version available on server" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");

                          const vKey = `${slot.slot}-${file.filename}`;
                          const isVExpanded = !!versionHistoryExpanded[vKey];
                          const versions = versionHistoryCache[vKey] ?? [];
                          const vLoading = !!versionHistoryLoading[vKey];

                          return (
                            <div
                              key={file.filename}
                              style={{
                                marginBottom: "16px",
                                paddingBottom: "12px",
                                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                              }}
                            >
                              {/* File Headline */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: "8px",
                                }}
                              >
                                <span style={{ fontWeight: 600, color: "#ffffff", fontSize: "14px" }}>
                                  {file.filename}
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  {file.local_size != null && (
                                    <span style={{ color: "#8f98a0", fontSize: "12px" }}>
                                      {formatBytes(file.local_size)}
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      color: statusColor,
                                    }}
                                  >
                                    {statusLabelText}
                                  </span>
                                </div>
                              </div>

                              {/* Conflict Alert */}
                              {conflict && (
                                <div
                                  style={{
                                    color: "#d94126",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    marginBottom: "8px",
                                  }}
                                >
                                  Conflict detected on this file
                                </div>
                              )}

                              {/* Details Grid */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                                <div style={{ display: "flex", gap: "12px" }}>
                                  <span style={{ color: "#6e7f91", width: "90px" }}>Last synced:</span>
                                  <span style={{ color: "#dfe3e6" }}>{lastSyncedStr}</span>
                                </div>

                                {file.server_updated_at && (
                                  <div style={{ display: "flex", gap: "12px" }}>
                                    <span style={{ color: "#6e7f91", width: "90px" }}>Last updated:</span>
                                    <span style={{ color: "#dfe3e6" }}>{formatTimestamp(file.server_updated_at)}</span>
                                  </div>
                                )}

                                {file.server_save_id != null && (
                                  <div style={{ display: "flex", gap: "12px" }}>
                                    <span style={{ color: "#6e7f91", width: "90px" }}>Server save:</span>
                                    <div style={{ color: "#dfe3e6" }}>
                                      <div>
                                        {`#${file.server_save_id}${file.server_emulator ? ` · ${file.server_emulator}` : ""}`}
                                      </div>
                                      {file.server_file_name && (
                                        <div style={{ color: "#8f98a0", fontFamily: "monospace", fontSize: "11px" }}>
                                          {file.server_file_name}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {file.local_path && (
                                  <div style={{ display: "flex", gap: "12px" }}>
                                    <span style={{ color: "#6e7f91", width: "90px" }}>Local path:</span>
                                    <span
                                      style={{
                                        color: "#8f98a0",
                                        fontFamily: "monospace",
                                        fontSize: "11px",
                                        wordBreak: "break-all",
                                      }}
                                    >
                                      {file.local_path}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Multi-file note */}
                              {saveStatus.multi_file && (
                                <div
                                  style={{
                                    marginTop: "8px",
                                    color: MUTED_COLOR,
                                    fontStyle: "italic",
                                    fontSize: "11px",
                                  }}
                                >
                                  This save spans multiple files. Per-version rollback is unavailable for multi-file
                                  saves.
                                </div>
                              )}

                              {/* Previous Versions Subsection (only for single-file saves) */}
                              {!saveStatus.multi_file && (
                                <div style={{ marginTop: "14px" }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#dfe3e6",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                        fontSize: "12px",
                                        padding: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                      onClick={() => toggleVersionHistory(slot.slot, file.filename)}
                                    >
                                      <span>{isVExpanded ? "▾" : "▸"}</span>
                                      <span>
                                        {isVExpanded && versions.length > 0
                                          ? `Previous Versions (${versions.length})`
                                          : "Previous Versions"}
                                      </span>
                                    </button>

                                    {file.server_save_id != null && (
                                      <button
                                        type="button"
                                        style={BUTTON_STYLE}
                                        onClick={() =>
                                          setCopyModalData({
                                            saveId: file.server_save_id!,
                                            sourceSlot: slot.slot,
                                          })
                                        }
                                        disabled={isOffline}
                                      >
                                        Copy to slot...
                                      </button>
                                    )}
                                  </div>

                                  {isVExpanded && (
                                    <div
                                      style={{
                                        marginTop: "8px",
                                        backgroundColor: "rgba(0, 0, 0, 0.2)",
                                        borderRadius: "3px",
                                        padding: "8px 12px",
                                      }}
                                    >
                                      {vLoading ? (
                                        <div style={{ color: MUTED_COLOR, fontStyle: "italic", fontSize: "11px" }}>
                                          Loading versions…
                                        </div>
                                      ) : versions.length === 0 ? (
                                        <div style={{ color: MUTED_COLOR, fontStyle: "italic", fontSize: "11px" }}>
                                          No older versions available
                                        </div>
                                      ) : (
                                        <div>
                                          {/* Table Header */}
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "140px 80px 1fr 80px",
                                              gap: "8px",
                                              fontSize: "10px",
                                              fontWeight: 600,
                                              color: "#6e7f91",
                                              textTransform: "uppercase",
                                              letterSpacing: "0.05em",
                                              paddingBottom: "6px",
                                              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                                            }}
                                          >
                                            <span>VERSION</span>
                                            <span>SIZE</span>
                                            <span>LAST UPDATED</span>
                                            <span style={{ textAlign: "right" }}>ACTION</span>
                                          </div>

                                          {/* Table Rows */}
                                          {versions.map((v) => {
                                            const vSyncer = pickLastSyncer(v.device_syncs);
                                            const vAttr = formatAttributionSegment(
                                              v.uploaded_by_us,
                                              vSyncer?.device_name,
                                              false,
                                            );
                                            const vDateStr = [
                                              formatRelativeTime(v.updated_at),
                                              vAttr ? vAttr.replace(" ✓", "") : null,
                                            ]
                                              .filter(Boolean)
                                              .join(" · ");

                                            const isRestoring = restoringVersionId === v.id;

                                            return (
                                              <div
                                                key={`ver-row-${v.id}`}
                                                style={{
                                                  display: "grid",
                                                  gridTemplateColumns: "140px 80px 1fr 80px",
                                                  gap: "8px",
                                                  alignItems: "center",
                                                  fontSize: "12px",
                                                  padding: "6px 0",
                                                  borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                                                }}
                                              >
                                                <span style={{ color: "#dfe3e6", fontWeight: 500 }}>
                                                  {`#${v.id}${v.emulator ? ` · ${v.emulator}` : ""}`}
                                                </span>
                                                <span style={{ color: "#8f98a0" }}>
                                                  {v.file_size_bytes != null ? formatBytes(v.file_size_bytes) : "—"}
                                                </span>
                                                <span style={{ color: "#8f98a0" }}>{vDateStr}</span>
                                                <div style={{ textAlign: "right" }}>
                                                  <button
                                                    type="button"
                                                    style={{
                                                      ...BUTTON_STYLE,
                                                      padding: "2px 8px",
                                                      fontSize: "11px",
                                                    }}
                                                    disabled={isRestoring || isOffline}
                                                    onClick={() => void handleRestoreVersion(slot.slot, v)}
                                                  >
                                                    {isRestoring ? "Restoring..." : "Restore"}
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ color: MUTED_COLOR, fontStyle: "italic", fontSize: "12px" }}>
                          No save files tracked yet
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Inactive Slot Body */
                    <div>
                      {loadingSlotSaves[slot.slot] ? (
                        <div style={{ color: MUTED_COLOR, fontStyle: "italic", fontSize: "12px" }}>Loading saves…</div>
                      ) : cachedInactiveSaves && cachedInactiveSaves.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
                          {cachedInactiveSaves.map((f) => (
                            <div
                              key={`srv-${f.id}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "4px 0",
                                borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                              }}
                            >
                              <div>
                                <div style={{ color: "#dfe3e6", fontWeight: 500, fontSize: "13px" }}>{f.filename}</div>
                                <div style={{ color: "#8f98a0", fontSize: "11px" }}>
                                  {`#${f.id}${f.size != null ? ` · ${formatBytes(f.size)}` : ""}${
                                    f.updated_at ? ` · Updated ${formatRelativeTime(f.updated_at)}` : ""
                                  }`}
                                </div>
                              </div>
                              <button
                                type="button"
                                style={{ ...BUTTON_STYLE, padding: "2px 8px", fontSize: "11px" }}
                                disabled={isOffline}
                                onClick={() => setCopyModalData({ saveId: f.id, sourceSlot: slot.slot })}
                              >
                                Copy to slot...
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{ color: MUTED_COLOR, fontStyle: "italic", fontSize: "12px", marginBottom: "12px" }}
                        >
                          No saves in this slot
                        </div>
                      )}

                      {/* Inactive slot actions */}
                      {!isLegacy ? (
                        <div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button
                              type="button"
                              style={BUTTON_STYLE}
                              disabled={isOffline}
                              onClick={() => void handleActivateSlot(slot.slot)}
                            >
                              Activate Slot
                            </button>
                            <button
                              type="button"
                              style={{
                                ...BUTTON_STYLE,
                                borderColor: "rgba(217, 65, 38, 0.4)",
                                color: "#ff6b6b",
                              }}
                              disabled={isOffline}
                              onClick={() => void handlePromptDeleteSlot(slot.slot)}
                            >
                              Delete Slot
                            </button>
                          </div>
                          {slotSwitchErrors[slot.slot] && (
                            <div style={{ color: "#d94126", fontSize: "11px", marginTop: "6px" }}>
                              {slotSwitchErrors[slot.slot]}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: MUTED_COLOR, fontStyle: "italic", fontSize: "11px" }}>
                          Used by the RomM web player. Read-only here — manage in the RomM web app.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New Slot Modal */}
      {showNewSlotModal && (
        <div style={MODAL_CONTAINER_STYLE}>
          <button
            type="button"
            aria-label="Close dialog"
            style={BACKDROP_BUTTON_STYLE}
            onClick={() => setShowNewSlotModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-slot-title"
            style={{ position: "relative", zIndex: 1, ...DIALOG_BOX_STYLE }}
          >
            <h3
              id="new-slot-title"
              style={{ margin: "0 0 8px 0", color: "#ffffff", fontSize: "16px", fontWeight: 700 }}
            >
              New Save Slot
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#a0b0c0" }}>
              Enter a name for the new save slot. It will become the active slot immediately.
            </p>

            <input
              type="text"
              placeholder="Slot Name (e.g. speedrun, casual)"
              value={newSlotInput}
              onChange={(e) => setNewSlotInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateSlot();
                if (e.key === "Escape") setShowNewSlotModal(false);
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                fontSize: "13px",
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "3px",
                color: "#ffffff",
                outline: "none",
                marginBottom: "12px",
              }}
            />

            {newSlotError && (
              <div style={{ color: "#d94126", fontSize: "12px", marginBottom: "12px" }}>{newSlotError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                style={{ ...BUTTON_STYLE, backgroundColor: "transparent" }}
                onClick={() => setShowNewSlotModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  ...BUTTON_STYLE,
                  backgroundColor: "#1a9fff",
                  borderColor: "#1a9fff",
                  opacity: newSlotInput.trim() === "" ? 0.6 : 1,
                }}
                disabled={newSlotInput.trim() === ""}
                onClick={() => void handleCreateSlot()}
              >
                Create Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy To Slot Modal */}
      {copyModalData && (
        <div style={MODAL_CONTAINER_STYLE}>
          <button
            type="button"
            aria-label="Close dialog"
            style={BACKDROP_BUTTON_STYLE}
            onClick={() => setCopyModalData(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-slot-title"
            style={{ position: "relative", zIndex: 1, ...DIALOG_BOX_STYLE }}
          >
            <h3
              id="copy-slot-title"
              style={{ margin: "0 0 8px 0", color: "#ffffff", fontSize: "16px", fontWeight: 700 }}
            >
              Copy save to slot
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#a0b0c0", lineHeight: 1.4 }}>
              Copies this save into the chosen slot, which becomes the active slot. The original save is kept.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
              {availableSlots
                .filter((s) => s.slot !== "" && s.slot !== copyModalData.sourceSlot)
                .map((s) => (
                  <button
                    key={`target-slot-${s.slot}`}
                    type="button"
                    style={{
                      ...BUTTON_STYLE,
                      textAlign: "left",
                      padding: "8px 12px",
                      width: "100%",
                    }}
                    onClick={() => void handleExecuteCopy(s.slot)}
                  >
                    {displaySlot(s.slot)}
                  </button>
                ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "12px" }}>
              <div style={{ fontSize: "12px", color: "#8f98a0", marginBottom: "6px" }}>Or copy to a new slot:</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="New slot name…"
                  value={copyNewSlotInput}
                  onChange={(e) => setCopyNewSlotInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && copyNewSlotInput.trim() !== "") {
                      void handleExecuteCopy(copyNewSlotInput.trim());
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: "12px",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "3px",
                    color: "#ffffff",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  style={{
                    ...BUTTON_STYLE,
                    opacity: copyNewSlotInput.trim() === "" ? 0.6 : 1,
                  }}
                  disabled={copyNewSlotInput.trim() === ""}
                  onClick={() => void handleExecuteCopy(copyNewSlotInput.trim())}
                >
                  Create & Copy
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                type="button"
                style={{ ...BUTTON_STYLE, backgroundColor: "transparent" }}
                onClick={() => setCopyModalData(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Slot Confirmation Modal */}
      {deleteModalSlot && (
        <div style={MODAL_CONTAINER_STYLE}>
          <button
            type="button"
            aria-label="Close dialog"
            style={BACKDROP_BUTTON_STYLE}
            onClick={() => setDeleteModalSlot(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-slot-title"
            style={{ position: "relative", zIndex: 1, ...DIALOG_BOX_STYLE }}
          >
            <h3
              id="delete-slot-title"
              style={{ margin: "0 0 8px 0", color: "#ffffff", fontSize: "16px", fontWeight: 700 }}
            >
              Delete Slot
            </h3>
            <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#a0b0c0", lineHeight: 1.4 }}>
              {deleteModalSlot.source === "server" && (deleteModalSlot.server_save_count ?? 0) > 0
                ? `This will permanently delete ${deleteModalSlot.server_save_count} save(s) from slot '${deleteModalSlot.slot}' on the RomM server.`
                : `This will remove slot '${deleteModalSlot.slot}' from your local configuration.`}
            </p>
            {(deleteModalSlot.local_file_count ?? 0) > 0 && (
              <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#a0b0c0" }}>
                {`${deleteModalSlot.local_file_count} tracked file(s) will be unlinked.`}
              </p>
            )}
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#d94126", fontWeight: 600 }}>
              This cannot be undone.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                style={{ ...BUTTON_STYLE, backgroundColor: "transparent" }}
                onClick={() => setDeleteModalSlot(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  ...BUTTON_STYLE,
                  backgroundColor: "#d94126",
                  borderColor: "#d94126",
                }}
                onClick={() => void handleConfirmDeleteSlot()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
