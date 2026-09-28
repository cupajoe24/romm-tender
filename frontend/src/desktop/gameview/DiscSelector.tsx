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
import { getCachedGameDetail, logError, logWarn } from "../../api/backend";
import type { DiscSelection, VersionList, VersionInfo } from "../../api/backend";
import { detach } from "../../utils/detach";
import { useOutsideClick } from "../../utils/useOutsideClick";
import { mountPruneLeaseOwner, releasePruneLeasesByOwner } from "../../utils/pruneLease";
import {
  executeVersionSwitch,
  loadVersionList as fetchVersionList,
  fetchVersionCovers,
} from "../../utils/versionSwitch";
import {
  type DiscOptionData,
  DISC_GREY,
  DISC_ACCENT,
  DiscStack,
  DiscWithNumber,
  computeDiscDisplayState,
  buildDiscOptions,
  fetchDiscSelection,
  executeDiscSelection,
} from "../../utils/discSelection";
import type { DownloadCompleteEvent, DownloadFailedEvent } from "../../types";
import type { RommDataChangedDetail, RommRomUninstalledDetail } from "../../types/events";
import { useDialogHost, type AskDialog } from "./dialogs/useDialogHost";
import { desktopUnsyncedSavesDialog } from "./dialogs/desktopDialogs";

export type { DiscOptionData };
export interface DiscSelectorProps {
  appId: number;
  ask?: AskDialog | undefined;
}

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

export const DiscSelector: FC<DiscSelectorProps> = ({ appId, ask }) => {
  const leaseOwner = `desktop-disc-selector:${appId}`;
  const versionLeaseOwner = `version-picker:${appId}`;

  const fallbackHost = useDialogHost();
  const effectiveAsk = ask ?? fallbackHost.ask;

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

  // Common UI state
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchDiscSelectionCallback = useCallback(async (rid: number): Promise<void> => {
    const result = await fetchDiscSelection(rid, "Desktop DiscSelector");
    if (!isMountedRef.current || !result) return;
    setSelection(result);
    setSelected(result.selected ?? null);
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
        const result = await fetchVersionList(appId, isCurrent);
        if (!result || !isCurrent()) return;
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
      await fetchDiscSelectionCallback(cached.rom_id);
    } catch (e) {
      logError(`Desktop DiscSelector init error: ${e}`);
    }
  }, [appId, fetchDiscSelectionCallback]);

  // Stable refs so the mount effect can depend on nothing that changes
  const initGameDetailRef = useRef(initGameDetail);
  useEffect(() => {
    initGameDetailRef.current = initGameDetail;
  }, [initGameDetail]);

  const loadVersionListRef = useRef<{
    appId: number;
    load: (source?: "normal" | "vanished_refusal") => Promise<void>;
  } | null>(null);

  useEffect(() => {
    loadVersionListRef.current = { appId, load: loadVersionList };
    return () => {
      if (loadVersionListRef.current?.load === loadVersionList) {
        loadVersionListRef.current = null;
      }
    };
  }, [appId, loadVersionList]);

  const runLoadVersionList = useCallback(
    (source?: "normal" | "vanished_refusal"): Promise<void> => {
      const loader = loadVersionListRef.current;
      if (loader?.appId !== appId) return Promise.resolve();
      return loader.load(source);
    },
    [appId],
  );

  // Mount & initial load — intentionally empty dep array so this runs exactly
  // once and never releases the prune lease mid-switch when state changes cause
  // callback identities to update.
  useEffect(() => {
    isMountedRef.current = true;
    mountPruneLeaseOwner(leaseOwner);
    mountPruneLeaseOwner(versionLeaseOwner);

    detach(
      (async () => {
        await Promise.all([initGameDetailRef.current(), runLoadVersionList()]);
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
    return fetchVersionCovers(versionList?.versions, coversRequested.current, (rid, base64) => {
      if (isMountedRef.current) {
        setCovers((prev) => ({ ...prev, [rid]: base64 }));
      }
    });
  }, [versionList]);

  // Event listeners — use refs for callbacks so we never re-register just because
  // a callback identity changed. romId is a real dep: the download_complete and
  // uninstall handlers branch on it.
  const fetchDiscSelectionRef = useRef(fetchDiscSelectionCallback);
  useEffect(() => {
    fetchDiscSelectionRef.current = fetchDiscSelectionCallback;
  }, [fetchDiscSelectionCallback]);

  useEffect(() => {
    const completeListener = addEventListener<DownloadCompleteEvent>(
      "download_complete",
      (evt: DownloadCompleteEvent) => {
        if (evt.rom_id === romId) {
          detach(fetchDiscSelectionRef.current(evt.rom_id));
        }
        if (memberIdsRef.current.has(evt.rom_id)) {
          detach(runLoadVersionList());
        }
      },
    );

    const failListener = addEventListener<DownloadFailedEvent>("download_failed", (evt: DownloadFailedEvent) => {
      if (memberIdsRef.current.has(evt.rom_id)) {
        detach(runLoadVersionList());
      }
    });

    const onUninstall = (e: Event) => {
      const rid = (e as CustomEvent<RommRomUninstalledDetail>).detail.rom_id;
      if (rid === romId) {
        setSelection(null);
        setSelected(null);
      }
      if (memberIdsRef.current.has(rid)) {
        detach(runLoadVersionList());
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
            await runLoadVersionList();
          })(),
        );
      } else if (pruned) {
        detach(runLoadVersionList());
      }
    };
    globalThis.addEventListener("romm_data_changed", onDataChanged);

    return () => {
      removeEventListener("download_complete", completeListener);
      removeEventListener("download_failed", failListener);
      globalThis.removeEventListener("romm_rom_uninstalled", onUninstall);
      globalThis.removeEventListener("romm_data_changed", onDataChanged);
    };
  }, [appId, romId, runLoadVersionList]);

  // Close dropdown menu on outside click
  useOutsideClick(menuRef, () => setShowMenu(false), showMenu);

  // Disc change handler
  const handleDiscChange = async (data: DiscOptionData): Promise<void> => {
    setShowMenu(false);
    if (romId == null) return;
    await executeDiscSelection({
      appId,
      romId,
      data,
      leaseOwner,
      onSelected: setSelected,
      logTag: "Desktop DiscSelector",
    });
  };

  const handleSwitch = async (target: VersionInfo): Promise<void> => {
    await executeVersionSwitch({
      appId,
      target,
      leaseOwner: versionLeaseOwner,
      askUnsyncedSaves: desktopUnsyncedSavesDialog(effectiveAsk),
      onCoverResolved: (rid, cover) => setCovers((prev) => ({ ...prev, [rid]: cover })),
      onVanishedRefusal: () => detach(runLoadVersionList("vanished_refusal")),
      setSwitching,
      logTag: "Desktop DiscSelector",
    });
  };

  const discDisplayState = computeDiscDisplayState(selection, selected);
  const hasDiscs = discDisplayState !== null;
  const hasVersions = Boolean(versionList?.multi_version && versionList.versions && versionList.versions.length > 0);

  // Single-disc & single-version -> render nothing (zero DOM footprint)
  if (!hasDiscs && !hasVersions) return null;

  const discOptions = selection && hasDiscs ? buildDiscOptions(selection) : [];

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
          {discDisplayState ? (
            discDisplayState.showPlaylistFace ? (
              <DiscStack size={20} color={DISC_GREY} />
            ) : (
              <DiscWithNumber
                size={20}
                color={discDisplayState.isPinned ? DISC_ACCENT : DISC_GREY}
                num={discDisplayState.activeNum}
              />
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
            {discDisplayState &&
              discOptions.map((o) => {
                const active = o.data === discDisplayState.effectiveSelected;
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
      {ask ? null : fallbackHost.element}
    </>
  );
};
