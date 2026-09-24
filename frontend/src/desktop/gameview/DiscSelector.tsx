/**
 * DiscSelector — inline disc and version picker in the Desktop frontend (#865, #1297).
 *
 * Sits immediately to the right of the Play button in the desktop play-section container.
 * Supports:
 *   - Multi-disc games (shows disc face, selects disc, updates shortcut launch options).
 *   - Multi-version sibling groups (shows layer group face, switches active version, updates shortcut).
 *   - Combined multi-disc and multi-version games (dropdown lists discs first, then versions).
 *
 * Single-disc / single-version / unknown ROMs render nothing (zero DOM footprint).
 */

import { useState, useEffect, useRef, useCallback, type FC, type ReactNode } from "react";
import { addEventListener, removeEventListener } from "../../api/host";
import { FaCompactDisc, FaChevronDown, FaLayerGroup, FaTrash } from "react-icons/fa";
import {
  getCachedGameDetail,
  getDiscSelection,
  selectDisc,
  getVersionList,
  switchVersion,
  syncRomSaves,
  refreshSaveStatus,
  fetchCoverBase64,
  logError,
  logWarn,
} from "../../api/backend";
import type {
  DiscSelection,
  VersionList,
  VersionInfo,
  SwitchVersionSuccess,
  SwitchVersionFailure,
  SwitchVersionUnsyncedSaves,
} from "../../api/backend";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";
import { detach } from "../../utils/detach";
import { showToast } from "../../utils/toast";
import { reportServerReachable } from "../../utils/connectionState";
import { applyCommittedVersionSwitch } from "../../utils/versionSwitchApplication";
import { setBoundVanished } from "../../utils/vanishedBinding";
import {
  capturePruneLeaseAdmission,
  isPruneLeaseAdmissionCurrent,
  isPruneLeaseCancellation,
  mountPruneLeaseOwner,
  releasePruneLeasesByOwner,
  withPruneLease,
  type PruneLeaseAdmission,
} from "../../utils/pruneLease";
import type { DownloadCompleteEvent, DownloadFailedEvent } from "../../types";
import type { RommDataChangedDetail, RommRomUninstalledDetail } from "../../types/events";

export interface DiscSelectorProps {
  appId: number;
}

/** A disc option's data value: a disc filename, or null for the m3u default. */
export type DiscOptionData = string | null;

const DISC_GREY = "#dcdedf";
const DISC_ACCENT = "#59b6ff";

const BADGE_COLORS: Record<"accent" | "muted" | "good", { bg: string; fg: string }> = {
  accent: { bg: "rgba(89, 182, 255, 0.18)", fg: DISC_ACCENT },
  good: { bg: "rgba(91, 163, 43, 0.22)", fg: "#7ac74f" },
  muted: { bg: "rgba(255, 255, 255, 0.10)", fg: "rgba(255, 255, 255, 0.55)" },
};

const Badge: FC<{ text: string; tone: "accent" | "muted" | "good" }> = ({ text, tone }) => {
  const { bg, fg } = BADGE_COLORS[tone];
  return (
    <span
      style={{
        marginLeft: "8px",
        padding: "1px 7px",
        borderRadius: "10px",
        fontSize: "11px",
        fontWeight: 600,
        backgroundColor: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

const AvailabilityHint: FC<{ text: string }> = ({ text }) => (
  <span style={{ marginLeft: "8px", fontSize: "11px", fontStyle: "italic", color: "#8091a2", whiteSpace: "nowrap" }}>
    {text}
  </span>
);

/** Two CDs stacked top-left -> bottom-right: the m3u "all discs" face. */
const DiscStack: FC<{ size: number; color: string }> = ({ size, color }) => {
  const step = Math.round(size * 0.3);
  return (
    <span style={{ position: "relative", display: "inline-block", width: size + step, height: size + step, color }}>
      <FaCompactDisc size={size} style={{ position: "absolute", left: step, top: step, opacity: 0.55 }} />
      <FaCompactDisc size={size} style={{ position: "absolute", left: 0, top: 0, opacity: 1 }} />
    </span>
  );
};

/** One CD + its number — the "Disc N" face. */
const DiscWithNumber: FC<{ size: number; color: string; num: string }> = ({ size, color, num }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color }}>
    <FaCompactDisc size={size} />
    {num ? <span style={{ fontWeight: 600, fontSize: `${Math.round(size * 0.6)}px` }}>{num}</span> : null}
  </span>
);

const reportVersionListReachability = (result: VersionList): void => {
  if (result.server_query_failed) {
    reportServerReachable(false);
  } else if (result.multi_version && !result.bound_vanished) {
    reportServerReachable(true);
  }
};

const MODAL_CONTAINER_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const BACKDROP_BUTTON_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  border: "none",
  margin: 0,
  padding: 0,
  cursor: "default",
};

export const DiscSelector: FC<DiscSelectorProps> = ({ appId }) => {
  const leaseOwner = `desktop-disc-selector:${appId}`;
  const versionLeaseOwner = `version-picker:${appId}`;

  const isMountedRef = useRef(false);

  // Disc state
  const [romId, setRomId] = useState<number | null>(null);
  const [selection, setSelection] = useState<DiscSelection | null>(null);
  const [selected, setSelected] = useState<DiscOptionData>(null);

  // Version state
  const [versionList, setVersionList] = useState<VersionList | null>(null);
  const [switching, setSwitching] = useState(false);
  const [covers, setCovers] = useState<Record<number, string>>({});
  const coversRequested = useRef<Set<number>>(new Set());
  const memberIdsRef = useRef<Set<number>>(new Set());
  const listRequestIdRef = useRef(0);
  const [unsyncedModalData, setUnsyncedModalData] = useState<{
    result: SwitchVersionUnsyncedSaves;
    target: VersionInfo;
  } | null>(null);

  // Common UI state
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchDiscSelection = useCallback(async (rid: number): Promise<void> => {
    try {
      const result = await getDiscSelection(rid);
      if (!isMountedRef.current) return;
      setSelection(result);
      setSelected(result.selected ?? null);
    } catch (e) {
      logError(`Desktop DiscSelector: getDiscSelection failed: ${e}`);
    }
  }, []);

  // NOTE: `switching` is intentionally NOT in the dep array. Its only use inside
  // was an extra guard before `setSwitching(false)`, which is idempotent and safe
  // to call unconditionally. Including `switching` gave this callback a new
  // identity on every setSwitching() call, which caused the mount useEffect to
  // re-run cleanup (releasePruneLeasesByOwner) mid-switch, incrementing the prune
  // lease generation and invalidating the admission captured before switchVersion().
  const loadVersionList = useCallback(
    async (source: "normal" | "vanished_refusal" = "normal"): Promise<void> => {
      const requestId = ++listRequestIdRef.current;
      const isCurrent = (): boolean => isMountedRef.current && requestId === listRequestIdRef.current;
      try {
        const result = await getVersionList(appId);
        if (!isCurrent()) return;
        reportVersionListReachability(result);
        setBoundVanished(appId, result.bound_vanished);
        memberIdsRef.current = new Set((result.versions ?? []).map((v) => v.rom_id));
        if (result.multi_version || result.bound_vanished) {
          setVersionList(result);
        }
      } catch (e) {
        if (!isCurrent()) return;
        if (source === "vanished_refusal") {
          logWarn(`Desktop DiscSelector: version-vanished list refresh failed: ${e}`);
        } else {
          logError(`Desktop DiscSelector: getVersionList failed: ${e}`);
        }
      } finally {
        if (source === "normal" && isCurrent()) setSwitching(false);
      }
    },
    [appId],
  );

  const initGameDetail = useCallback(async (): Promise<void> => {
    try {
      const cached = await getCachedGameDetail(appId);
      if (!isMountedRef.current || !cached.found || cached.rom_id == null) return;
      setRomId(cached.rom_id);
      if (!cached.installed) return;
      await fetchDiscSelection(cached.rom_id);
    } catch (e) {
      logError(`Desktop DiscSelector init error: ${e}`);
    }
  }, [appId, fetchDiscSelection]);

  // Stable refs so the mount effect can depend on nothing that changes
  const initGameDetailRef = useRef(initGameDetail);
  const loadVersionListRef = useRef(loadVersionList);
  useEffect(() => {
    initGameDetailRef.current = initGameDetail;
  }, [initGameDetail]);
  useEffect(() => {
    loadVersionListRef.current = loadVersionList;
  }, [loadVersionList]);

  // Mount & initial load — intentionally empty dep array so this runs exactly
  // once and never releases the prune lease mid-switch when state changes cause
  // callback identities to update.
  useEffect(() => {
    isMountedRef.current = true;
    mountPruneLeaseOwner(leaseOwner);
    mountPruneLeaseOwner(versionLeaseOwner);

    detach(
      (async () => {
        await Promise.all([initGameDetailRef.current(), loadVersionListRef.current()]);
      })(),
    );

    return () => {
      isMountedRef.current = false;
      detach(releasePruneLeasesByOwner(leaseOwner));
      detach(releasePruneLeasesByOwner(versionLeaseOwner));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy fetch covers for versions
  useEffect(() => {
    const versions = versionList?.versions;
    if (!versions) return;
    let cancelled = false;
    for (const v of versions) {
      if (coversRequested.current.has(v.rom_id)) continue;
      coversRequested.current.add(v.rom_id);
      fetchCoverBase64(v.rom_id)
        .then((result) => {
          if (!cancelled && isMountedRef.current && result.base64) {
            setCovers((prev) => ({ ...prev, [v.rom_id]: result.base64! }));
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [versionList]);

  // Event listeners — use refs for callbacks so we never re-register just because
  // a callback identity changed. romId is a real dep: the download_complete and
  // uninstall handlers branch on it.
  const fetchDiscSelectionRef = useRef(fetchDiscSelection);
  useEffect(() => {
    fetchDiscSelectionRef.current = fetchDiscSelection;
  }, [fetchDiscSelection]);

  useEffect(() => {
    const completeListener = addEventListener<[DownloadCompleteEvent]>(
      "download_complete",
      (evt: DownloadCompleteEvent) => {
        if (evt.rom_id === romId) {
          detach(fetchDiscSelectionRef.current(evt.rom_id));
        }
        if (memberIdsRef.current.has(evt.rom_id)) {
          detach(loadVersionListRef.current());
        }
      },
    );

    const failListener = addEventListener<[DownloadFailedEvent]>("download_failed", (evt: DownloadFailedEvent) => {
      if (memberIdsRef.current.has(evt.rom_id)) {
        detach(loadVersionListRef.current());
      }
    });

    const onUninstall = (e: Event) => {
      const rid = (e as CustomEvent<RommRomUninstalledDetail>).detail.rom_id;
      if (rid === romId) {
        setSelection(null);
        setSelected(null);
      }
      if (memberIdsRef.current.has(rid)) {
        detach(loadVersionListRef.current());
      }
    };
    globalThis.addEventListener("romm_rom_uninstalled", onUninstall);

    const onDataChanged = (e: Event) => {
      const detail = (e as CustomEvent<RommDataChangedDetail>).detail;
      const switched = detail.type === "version_switched" && detail.app_id === appId;
      const pruned =
        detail.type === "rom_pruned" &&
        (detail.app_ids.includes(appId) || detail.rom_ids.some((rid) => memberIdsRef.current.has(rid)));

      if (switched) {
        detach(
          (async () => {
            await initGameDetailRef.current();
            await loadVersionListRef.current();
          })(),
        );
      } else if (pruned) {
        detach(loadVersionListRef.current());
      }
    };
    globalThis.addEventListener("romm_data_changed", onDataChanged);

    return () => {
      removeEventListener("download_complete", completeListener);
      removeEventListener("download_failed", failListener);
      globalThis.removeEventListener("romm_rom_uninstalled", onUninstall);
      globalThis.removeEventListener("romm_data_changed", onDataChanged);
    };
  }, [appId, romId]);

  // Close dropdown menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showMenu]);

  // Disc change handler
  const handleDiscChange = async (data: DiscOptionData): Promise<void> => {
    setShowMenu(false);
    if (romId == null) return;
    const admission = capturePruneLeaseAdmission(leaseOwner);
    try {
      const result = await selectDisc(romId, data);
      await withPruneLease(
        result.prune_lease_token,
        "DesktopDiscSelector",
        async (signal) => {
          if (result.success) {
            if (result.launch_options !== undefined) {
              if (signal.aborted) return;
              await setLaunchOptionsConfirmed(appId, result.launch_options);
            }
            if (signal.aborted) return;
            setSelected(result.selected ?? null);
          } else {
            showToast(result.message || "Failed to select disc");
          }
        },
        leaseOwner,
        admission,
      );
    } catch (e) {
      if (isPruneLeaseCancellation(e, admission)) {
        logWarn(`Desktop DiscSelector: disc selection continuation was cancelled: ${e}`);
        return;
      }
      logError(`Desktop DiscSelector: selectDisc failed: ${e}`);
      showToast("Failed to select disc");
    }
  };

  // Version switch success
  const applySwitchSuccess = async (result: SwitchVersionSuccess, admission: PruneLeaseAdmission): Promise<void> => {
    const confirmed = await applyCommittedVersionSwitch(
      result,
      (rid, cover) => setCovers((prev) => ({ ...prev, [rid]: cover })),
      admission,
    );
    if (!confirmed) {
      showToast("Switched — re-switch if launch fails");
    }
  };

  const handleSwitchFailure = (result: SwitchVersionFailure | SwitchVersionUnsyncedSaves): void => {
    if (result.reason === "server_unreachable") reportServerReachable(false);
    setSwitching(false);
    showToast("Could not switch version", { subtext: result.message });
    if (result.reason === "version_vanished") {
      detach(loadVersionList("vanished_refusal"));
    }
  };

  const syncThenSwitch = async (
    unsyncedRomId: number,
    target: VersionInfo,
    admission: PruneLeaseAdmission,
  ): Promise<void> => {
    const refreshStrandedSaveStatus = (): void => {
      detach(
        refreshSaveStatus(unsyncedRomId).catch((e) =>
          logWarn(`Desktop DiscSelector: post-abort save-status refresh failed for rom ${unsyncedRomId}: ${e}`),
        ),
      );
    };
    const abort = (body: string): void => {
      setSwitching(false);
      showToast(body);
      refreshStrandedSaveStatus();
    };
    if (!isPruneLeaseAdmissionCurrent(admission)) return;
    try {
      const sync = await syncRomSaves(unsyncedRomId);
      if (!isPruneLeaseAdmissionCurrent(admission)) return;
      if (!sync.success) {
        abort("Couldn't sync saves — try again");
        return;
      }
      if (sync.conflicts && sync.conflicts.length > 0) {
        abort("Resolve save conflicts first");
        return;
      }
      if (!isPruneLeaseAdmissionCurrent(admission)) return;
      const retry = await switchVersion(appId, target.rom_id, false);
      if (retry.success) {
        await applySwitchSuccess(retry, admission);
      } else if (retry.reason === "unsynced_saves") {
        abort("Saves still unsynced — try again");
      } else {
        handleSwitchFailure(retry);
        refreshStrandedSaveStatus();
      }
    } catch (e) {
      if (!isPruneLeaseAdmissionCurrent(admission)) return;
      logError(`Desktop DiscSelector: sync-then-switch failed: ${e}`);
      abort("Couldn't sync saves — try again");
    }
  };

  const handleSwitch = async (target: VersionInfo): Promise<void> => {
    if (target.active || target.vanished || !target.switchable) return;
    setSwitching(true);
    const admission = capturePruneLeaseAdmission(versionLeaseOwner);
    try {
      const result = await switchVersion(appId, target.rom_id, false);
      if (result.success) {
        await applySwitchSuccess(result, admission);
        return;
      }
      if (result.reason === "unsynced_saves") {
        reportServerReachable(result.server_reachable);
        setUnsyncedModalData({ result, target });
        return;
      }
      handleSwitchFailure(result);
    } catch (e) {
      if (isPruneLeaseCancellation(e, admission)) {
        logWarn(`Desktop DiscSelector: version switch continuation was cancelled: ${e}`);
        return;
      }
      setSwitching(false);
      logError(`Desktop DiscSelector: switchVersion failed: ${e}`);
      showToast("Could not switch version");
    }
  };

  const handleSwitchAnyway = async (): Promise<void> => {
    if (!unsyncedModalData) return;
    const { target } = unsyncedModalData;
    setUnsyncedModalData(null);
    const admission = capturePruneLeaseAdmission(versionLeaseOwner);
    const forced = await switchVersion(appId, target.rom_id, true);
    if (forced.success) {
      await applySwitchSuccess(forced, admission);
    } else {
      handleSwitchFailure(forced);
    }
  };

  const handleSyncOrSwitch = async (): Promise<void> => {
    if (!unsyncedModalData) return;
    const { result, target } = unsyncedModalData;
    setUnsyncedModalData(null);
    const admission = capturePruneLeaseAdmission(versionLeaseOwner);
    if (result.server_reachable) {
      await syncThenSwitch(result.unsynced_rom_id, target, admission);
    } else {
      const forced = await switchVersion(appId, target.rom_id, true);
      if (forced.success) {
        await applySwitchSuccess(forced, admission);
      } else {
        handleSwitchFailure(forced);
      }
    }
  };

  const hasDiscs = Boolean(selection?.multi_disc && selection.discs && selection.default);
  const hasVersions = Boolean(versionList?.multi_version && versionList.versions && versionList.versions.length > 0);

  // Single-disc & single-version -> render nothing (zero DOM footprint)
  if (!hasDiscs && !hasVersions) return null;

  // Prepare disc details
  let isM3u = false;
  let effectiveSelected: DiscOptionData = null;
  let isPinned = false;
  let showPlaylistFace = false;
  let activeNum = "";
  const discOptions: { data: DiscOptionData; icon: ReactNode; text: string }[] = [];

  if (hasDiscs && selection?.discs && selection.default) {
    const { discs, default: dflt } = selection;
    isM3u = dflt.kind === "m3u";
    effectiveSelected = selected ?? (isM3u ? null : dflt.filename);
    isPinned = selected !== null;
    showPlaylistFace = isM3u && selected === null;
    const activeDisc = discs.find((d) => d.filename === effectiveSelected);
    activeNum = activeDisc ? (activeDisc.label.match(/\d+/)?.[0] ?? String(activeDisc.index)) : "";

    if (isM3u) {
      discOptions.push({ data: null, icon: <DiscStack size={16} color={DISC_GREY} />, text: dflt.label });
    }
    for (const disc of discs) {
      discOptions.push({ data: disc.filename, icon: <FaCompactDisc size={16} />, text: disc.label });
    }
  }

  // Prepare version details
  const versions = versionList?.versions ?? [];
  const activeVersion = versions.find((v) => v.active);
  const activeIsDefault = activeVersion?.is_default ?? false;

  const rowCover = (v: VersionInfo): ReactNode => {
    const base64 = covers[v.rom_id];
    if (base64) {
      return (
        <img
          alt=""
          src={`data:image/png;base64,${base64}`}
          style={{ width: "24px", height: "24px", borderRadius: "2px", objectFit: "cover", flexShrink: 0 }}
        />
      );
    }
    return <FaCompactDisc size={18} color={DISC_GREY} style={{ flexShrink: 0 }} />;
  };

  const buttonTitle = hasDiscs && hasVersions ? "Select Disc or Version" : hasDiscs ? "Select Disc" : "Select Version";

  return (
    <>
      <div style={{ position: "relative" }} ref={menuRef}>
        <button
          type="button"
          className="tender-desktop-disc-btn"
          data-testid="disc-btn"
          title={buttonTitle}
          aria-label={buttonTitle}
          aria-haspopup="true"
          aria-expanded={showMenu}
          disabled={switching}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
            height: "48px",
            padding: "0 12px",
            marginLeft: "8px",
            borderRadius: "2px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(255, 255, 255, 0.06)",
            color: "#ffffff",
            cursor: switching ? "default" : "pointer",
            opacity: switching ? 0.55 : 1,
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.4)",
            transition: "background 0.15s ease, filter 0.15s ease",
            lineHeight: "normal",
            boxSizing: "border-box",
          }}
          onClick={() => setShowMenu((prev) => !prev)}
        >
          {hasDiscs ? (
            showPlaylistFace ? (
              <DiscStack size={20} color={DISC_GREY} />
            ) : (
              <DiscWithNumber size={20} color={isPinned ? DISC_ACCENT : DISC_GREY} num={activeNum} />
            )
          ) : (
            <FaLayerGroup size={20} color={activeIsDefault ? DISC_GREY : DISC_ACCENT} />
          )}
          {switching ? (
            <span className="romm-throbber" style={{ width: "14px", height: "14px" }} />
          ) : (
            <FaChevronDown size={10} color="#cfd3d8" />
          )}
        </button>

        {showMenu && (
          <div
            className="tender-desktop-disc-menu"
            data-testid="disc-menu"
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: "8px",
              minWidth: "180px",
              maxHeight: "360px",
              overflowY: "auto",
              background: "#1e2837",
              border: "1px solid #3c4856",
              borderRadius: "2px",
              boxShadow: "0 8px 16px rgba(0, 0, 0, 0.5)",
              zIndex: 1000,
              padding: "4px 0",
            }}
          >
            {/* Section 1: Discs (ordered first) */}
            {hasDiscs &&
              discOptions.map((o) => {
                const active = o.data === effectiveSelected;
                return (
                  <button
                    key={String(o.data)}
                    type="button"
                    role="menuitem"
                    className="tender-desktop-disc-menu-item"
                    style={{
                      width: "100%",
                      padding: "8px 16px",
                      textAlign: "left",
                      background: active ? "rgba(89, 182, 255, 0.1)" : "transparent",
                      border: "none",
                      color: active ? DISC_ACCENT : "#c7d5e0",
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                    onClick={() => {
                      void handleDiscChange(o.data);
                    }}
                  >
                    {o.icon}
                    <span style={{ flex: 1, whiteSpace: "nowrap" }}>{o.text}</span>
                    {active ? <span style={{ marginLeft: "6px", fontWeight: 700 }}>✓</span> : null}
                  </button>
                );
              })}

            {/* Spacer bar between disc playlists and versions */}
            {hasDiscs && hasVersions && (
              <div
                role="separator"
                data-testid="disc-version-separator"
                style={{
                  height: "1px",
                  background: "#67707b",
                  margin: "4px 0",
                }}
              />
            )}

            {/* Section 2: Versions (ordered second) */}
            {hasVersions &&
              versions.map((v) => {
                const active = v.active;
                const disabled = v.vanished || !v.switchable;

                return (
                  <button
                    key={v.rom_id}
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    className="tender-desktop-disc-menu-item"
                    style={{
                      width: "100%",
                      padding: "8px 16px",
                      textAlign: "left",
                      background: active ? "rgba(89, 182, 255, 0.1)" : "transparent",
                      border: "none",
                      color: active ? DISC_ACCENT : "#c7d5e0",
                      fontSize: "13px",
                      cursor: disabled ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      opacity: disabled ? 0.55 : 1,
                    }}
                    onClick={() => {
                      if (!disabled) {
                        setShowMenu(false);
                        detach(handleSwitch(v));
                      }
                    }}
                  >
                    {rowCover(v)}
                    <span style={{ whiteSpace: "nowrap", fontWeight: active ? 600 : 400 }}>
                      {v.label || v.name || String(v.rom_id)}
                    </span>
                    {v.is_default ? <Badge text="Default" tone="accent" /> : null}
                    {v.installed ? <Badge text="Downloaded" tone="good" /> : null}
                    {v.switchable && !v.synced ? <Badge text="not synced" tone="muted" /> : null}
                    {v.vanished ? <AvailabilityHint text="No longer available on RomM" /> : null}
                    {!v.switchable && !v.vanished ? (
                      <AvailabilityHint text="conflicting metadata match in RomM" />
                    ) : null}
                    {active ? <span style={{ marginLeft: "auto", fontWeight: 700 }}>✓</span> : null}
                    {v.vanished && v.synced ? (
                      <FaTrash
                        size={12}
                        role="img"
                        aria-label="No longer available"
                        style={{ marginLeft: "auto", flexShrink: 0, color: "#8091a2" }}
                      />
                    ) : null}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Desktop Unsynced Saves Modal */}
      {unsyncedModalData && (
        <div style={MODAL_CONTAINER_STYLE}>
          <button
            type="button"
            aria-label="Close dialog"
            style={BACKDROP_BUTTON_STYLE}
            onClick={() => {
              setUnsyncedModalData(null);
              setSwitching(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsynced-saves-title"
            style={{
              position: "relative",
              zIndex: 1,
              backgroundColor: "#1b2838",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "4px",
              padding: "24px",
              maxWidth: "460px",
              width: "90%",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)",
              color: "#ffffff",
              boxSizing: "border-box",
            }}
          >
            <h3
              id="unsynced-saves-title"
              style={{ margin: "0 0 12px 0", color: "#ffffff", fontSize: "16px", fontWeight: 700 }}
            >
              Unsynced saves
            </h3>
            <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#a0b0c0", lineHeight: 1.5 }}>
              {unsyncedModalData.result.server_reachable
                ? `"${unsyncedModalData.result.unsynced_version_name}" has save changes that were never uploaded to RomM. They stay on disk, but won't sync until you switch back.`
                : `"${unsyncedModalData.result.unsynced_version_name}" has save changes that were never uploaded, and RomM is not reachable right now — so they can't be synced first. They stay on disk, but won't sync until you switch back.`}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "2px",
                  color: "#c7d5e0",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setUnsyncedModalData(null);
                  setSwitching(false);
                }}
              >
                Cancel
              </button>
              {unsyncedModalData.result.server_reachable && (
                <button
                  type="button"
                  style={{
                    padding: "8px 16px",
                    fontSize: "13px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "2px",
                    color: "#c7d5e0",
                    cursor: "pointer",
                  }}
                  onClick={() => void handleSwitchAnyway()}
                >
                  Switch anyway
                </button>
              )}
              <button
                type="button"
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  backgroundColor: "#1a9fff",
                  border: "none",
                  borderRadius: "2px",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => void handleSyncOrSwitch()}
              >
                {unsyncedModalData.result.server_reachable ? "Sync now & switch" : "Switch anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
