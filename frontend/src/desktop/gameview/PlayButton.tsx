/**
 * Play/Download button for the Steam Desktop game view.
 *
 * Replaces Steam's native static Play button on RomM shortcut detail pages.
 * Handles the full state lifecycle mirroring Big Picture view:
 *   - "download": ROM not installed; button displays "DOWNLOAD" (blue).
 *   - "downloading": Active download in flight; shows progress bar, downloaded / total
 *     bytes (or extraction percentage), cancel button, and pause/resume if resumable.
 *   - "dl_complete": Brief "Ready!" transition.
 *   - "play": ROM installed; button displays "PLAY" (green). Clicking runs pre-launch
 *     save sync (if enabled), reconfirms launch options, and launches the game.
 *   - "syncing": Pre-launch save sync in progress ("Syncing saves...").
 *   - "launching": Launching via Steam ("Launching...").
 *   - "running": Game actively running; displays "RESUME" with a stop option.
 *   - "conflict": Unresolved save conflict; displays "Resolve Conflict".
 *   - Includes an actions menu dropdown (chevron) with "Uninstall".
 */

import { useState, useEffect, useRef, type FC, type MouseEvent } from "react";
import { addEventListener, removeEventListener } from "@decky/api";
import {
  startDownload,
  cancelDownload,
  pauseDownload,
  resumeDownload,
  removeRom,
  preLaunchSync,
  stopRunningGame,
  reconcilePlaytime,
  debugLog,
  invalidateCachedGameDetail,
  getSaveSetupInfo,
  getBiosStatus,
  probeReachability,
  type BiosAnswer,
} from "../../api/backend";
import { useGameDetail, refreshSaveStatus } from "../../utils/gameDetailStore";
import { useDownloads } from "../../utils/downloadStore";
import { useRommConnectionState, reportServerReachable } from "../../utils/connectionState";
import { registerConnectionHeartbeat } from "../../utils/connectionHeartbeat";
import { isSessionActive } from "../../utils/sessionManager";
import { isAppRunning } from "../../utils/runningApps";
import { hasAnySaveConflict } from "../../utils/saveStatus";
import { saveSyncToastBody } from "../../utils/saveSyncToast";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";
import { reconfirmLaunchOptions } from "../../utils/launchOptionsReconcile";
import {
  capturePruneLeaseAdmission,
  mountPruneLeaseOwner,
  releasePruneLeasesByOwner,
  withPruneLease,
} from "../../utils/pruneLease";
import { showToast } from "../../utils/toast";
import { detach } from "../../utils/detach";
import {
  formatBytes,
  formatLastPlayed,
  formatPlaytime,
  formatTimeAgo,
  resolveLastPlayed,
} from "../../utils/formatters";
import { updatePlaytimeDisplay } from "../../utils/metadataPatches";
import { overviewFor } from "../../utils/steamOverview";
import { BIOS_MISSING_RED } from "../../utils/biosColor";
import { markLaunchSkipped } from "../../utils/launchGate";
import { findDesktopWindow } from "../desktopWindow";
import type { DownloadCompleteEvent, DownloadFailedEvent, SaveSetupInfo } from "../../types";

export interface PlayButtonProps {
  appId: number;
}

export type PlayButtonState =
  | "loading"
  | "download"
  | "downloading"
  | "dl_complete"
  | "play"
  | "syncing"
  | "launching"
  | "running"
  | "conflict"
  | "uninstalling";

interface SteamClientStub {
  Apps?: {
    RunGame?: (appId: string, args: string, flags: number, unk: number) => void;
  };
}

interface PlaytimeState {
  lastPlayed: string;
  restoredLastPlayed: string | null;
  playtime: string;
}

// Download button blue gradient stops
const BLUE_LEFT: [number, number, number] = [26, 159, 255]; // #1a9fff
const BLUE_RIGHT: [number, number, number] = [0, 120, 212]; // #0078d4
// Play button green gradient stops
const GREEN_LEFT: [number, number, number] = [89, 191, 67]; // #59bf43
const GREEN_RIGHT: [number, number, number] = [64, 153, 48]; // #409930

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export const PULSE_STYLE_ID = "tender-desktop-playbutton-pulse-styles";

export function ensurePulseStyles(doc?: Document | null) {
  const targetDoc =
    doc ||
    (typeof findDesktopWindow === "function" ? findDesktopWindow()?.document : null) ||
    (typeof document !== "undefined" ? document : null);
  if (!targetDoc) return;
  if (targetDoc.getElementById(PULSE_STYLE_ID)) return;

  const style = targetDoc.createElement("style");
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes tender-desktop-dl-pulse {
      0%, 100% {
        box-shadow: 0 0 6px rgba(26, 159, 255, 0.35), 0 1px 4px rgba(0, 0, 0, 0.4);
      }
      50% {
        box-shadow: 0 0 24px rgba(26, 159, 255, 0.85), 0 0 8px rgba(26, 159, 255, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4);
      }
    }
    .tender-desktop-dl-pulsing {
      animation: tender-desktop-dl-pulse 2s ease-in-out infinite !important;
      overflow: visible !important;
    }
    #tender-desktop-play-button-host {
      overflow: visible !important;
    }
    .romm-status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `;
  targetDoc.head.appendChild(style);
}

export const PlayButton: FC<PlayButtonProps> = ({ appId }) => {
  const detail = useGameDetail(appId);
  const downloads = useDownloads();

  const overview = overviewFor(appId);
  const initialLastPlayed = formatLastPlayed(overview?.rt_last_time_played ?? 0);
  const initialPlaytime = formatPlaytime(overview?.minutes_playtime_forever ?? 0);

  const [playtimeInfo, setPlaytimeInfo] = useState<PlaytimeState>({
    lastPlayed: initialLastPlayed,
    restoredLastPlayed: null,
    playtime: initialPlaytime,
  });

  const [stateOverride, setStateOverride] = useState<PlayButtonState | null>(null);
  const connectionState = useRommConnectionState();
  const isOffline = connectionState === "offline";
  const [setupInfo, setSetupInfo] = useState<SaveSetupInfo | null>(null);
  const [biosAnswer, setBiosAnswer] = useState<BiosAnswer | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const romId = detail.romId;
  const leaseOwner = `desktop-play-button:${appId}`;

  // Fetch SaveSetupInfo and BiosStatus for indicator badges
  useEffect(() => {
    if (!romId) return;

    let cancelled = false;

    const fetchStatus = () => {
      if (detail.saveSyncEnabled) {
        getSaveSetupInfo(romId)
          .then((info) => {
            if (!cancelled) setSetupInfo(info);
          })
          .catch((e) => {
            detach(debugLog(`PlayButton getSaveSetupInfo error: ${e}`));
          });
      }

      getBiosStatus(romId)
        .then((ans) => {
          if (!cancelled) setBiosAnswer(ans);
        })
        .catch((e) => {
          detach(debugLog(`PlayButton getBiosStatus error: ${e}`));
        });
    };

    fetchStatus();

    const handleSaveSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ rom_id?: number }>;
      if (customEvent.detail.rom_id === undefined || customEvent.detail.rom_id === romId) {
        fetchStatus();
      }
    };

    globalThis.addEventListener("romm_save_sync", handleSaveSync);
    globalThis.addEventListener("romm_data_changed", fetchStatus);

    return () => {
      cancelled = true;
      globalThis.removeEventListener("romm_save_sync", handleSaveSync);
      globalThis.removeEventListener("romm_data_changed", fetchStatus);
    };
  }, [romId, detail.saveSyncEnabled]);

  useEffect(() => {
    mountPruneLeaseOwner(leaseOwner);
    return () => {
      detach(releasePruneLeasesByOwner(leaseOwner));
    };
  }, [leaseOwner]);

  // Drive the reachability heartbeat while this game page is mounted (#1345) —
  // probes reachability periodically (every 30s, mirroring Big Picture) so offline
  // and recovery transitions reflect automatically without user interaction.
  useEffect(() => registerConnectionHeartbeat(), []);

  // Check reachability on mount
  useEffect(() => {
    let cancelled = false;
    probeReachability()
      .then((r) => {
        if (!cancelled) {
          reportServerReachable(r.online === true);
        }
      })
      .catch((e) => {
        detach(debugLog(`PlayButton reachability probe failed: ${e}`));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure download pulsing keyframes are present in the target document
  useEffect(() => {
    const doc =
      containerRef.current?.ownerDocument ||
      (typeof findDesktopWindow === "function" ? findDesktopWindow()?.document : null) ||
      (typeof document !== "undefined" ? document : null);
    ensurePulseStyles(doc);
  }, []);

  // Close actions menu on outside click
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

  // Find matching in-flight download for this ROM
  const activeDownload = romId ? downloads.find((d) => d.rom_id === romId) : undefined;
  const isTransferActive =
    activeDownload &&
    (activeDownload.status === "downloading" ||
      activeDownload.status === "extracting" ||
      activeDownload.status === "queued" ||
      activeDownload.status === "paused");

  // Determine current effective state
  let effectiveState: PlayButtonState = "loading";

  if (stateOverride) {
    effectiveState = stateOverride;
  } else if (isTransferActive) {
    effectiveState = "downloading";
  } else if (romId && (isSessionActive(romId) || isAppRunning(appId))) {
    effectiveState = "running";
  } else if (detail.installed) {
    if (detail.saveStatus && hasAnySaveConflict(detail.saveStatus)) {
      effectiveState = "conflict";
    } else {
      effectiveState = "play";
    }
  } else if (romId !== null) {
    effectiveState = "download";
  }

  // Listen for download completion and failure events
  useEffect(() => {
    const handleComplete = (e: DownloadCompleteEvent) => {
      if (e.rom_id === romId || e.app_id === appId) {
        detach(setLaunchOptionsConfirmed(appId, e.launch_options).catch(() => false));
        invalidateCachedGameDetail(appId);
        setStateOverride("dl_complete");
        setTimeout(() => {
          setStateOverride(null);
        }, 1500);
      }
    };

    const handleFailed = (e: DownloadFailedEvent) => {
      if (e.rom_id === romId) {
        setStateOverride(null);
        showToast(e.error_message || "Download failed");
      }
    };

    addEventListener("download_complete", handleComplete);
    addEventListener("download_failed", handleFailed);

    return () => {
      removeEventListener("download_complete", handleComplete);
      removeEventListener("download_failed", handleFailed);
    };
  }, [appId, romId]);

  // Reconcile-on-view: folds RomM's play-session history into local total
  useEffect(() => {
    if (!romId) return;
    let cancelled = false;

    async function doReconcilePlaytime(rid: number, isCancelled: () => boolean) {
      try {
        const result = await reconcilePlaytime(rid);
        if (isCancelled()) return;
        if ("success" in result) {
          detach(debugLog(`DesktopPlayButton: playtime reconcile deferred: ${result.message}`));
          return;
        }
        if (!result.server_query_failed) {
          const ov = overviewFor(appId);
          const steamSecs = ov?.rt_last_time_played ?? 0;
          setPlaytimeInfo((prev) => ({
            ...prev,
            restoredLastPlayed: result.last_played,
            lastPlayed: resolveLastPlayed(result.last_played, steamSecs),
          }));
        }
        updatePlaytimeDisplay(appId, result.total_seconds, false);
      } catch (e) {
        detach(debugLog(`DesktopPlayButton: playtime reconcile error: ${e}`));
      }
    }

    detach(doReconcilePlaytime(romId, () => cancelled));
    return () => {
      cancelled = true;
    };
  }, [romId, appId]);

  // Reactive PLAYTIME display: re-read Steam's overview on romm_playtime_changed
  useEffect(() => {
    const onPlaytimeChanged = (e: Event) => {
      const payload = (e as CustomEvent<{ appId?: number } | null>).detail;
      if (payload?.appId !== appId) return;
      const ov = overviewFor(appId);
      if (!ov) return;
      setPlaytimeInfo((prev) => ({
        ...prev,
        playtime: formatPlaytime(ov.minutes_playtime_forever ?? 0),
        lastPlayed: resolveLastPlayed(prev.restoredLastPlayed, ov.rt_last_time_played ?? 0),
      }));
    };
    globalThis.addEventListener("romm_playtime_changed", onPlaytimeChanged);
    return () => {
      globalThis.removeEventListener("romm_playtime_changed", onPlaytimeChanged);
    };
  }, [appId]);

  // Handlers
  const handleDownloadClick = async () => {
    if (!romId || isOffline || effectiveState === "downloading") return;

    setStateOverride("downloading");
    try {
      const result = await startDownload(romId, false, null, null, false);
      if (!result.success) {
        setStateOverride(null);
        showToast(result.message || "Download failed");
      }
    } catch {
      setStateOverride(null);
      showToast("Download failed — is RomM server running?");
    }
  };

  const handleCancelClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!romId) return;
    detach(cancelDownload(romId).catch(() => {}));
    setStateOverride(null);
  };

  const handlePauseResumeClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!romId || !activeDownload) return;
    if (activeDownload.status === "paused") {
      detach(resumeDownload(romId).catch(() => {}));
    } else {
      detach(pauseDownload(romId).catch(() => {}));
    }
  };

  const handlePlayClick = async () => {
    if (!romId || effectiveState === "syncing" || effectiveState === "launching") return;

    // Already running -> bring to front
    if (isSessionActive(romId) || isAppRunning(appId)) {
      launchGame();
      return;
    }

    // Pre-launch save sync if enabled
    if (detail.saveSyncEnabled) {
      setStateOverride("syncing");
      try {
        const syncResult = await preLaunchSync(romId);
        if (!syncResult.success) {
          detach(debugLog(`DesktopPlayButton: pre-launch sync failed: ${syncResult.message}`));
        } else {
          const toastBody = saveSyncToastBody(syncResult.uploaded, syncResult.downloaded);
          if (toastBody) showToast(toastBody);
        }
      } catch (err) {
        detach(debugLog(`DesktopPlayButton: pre-launch sync error: ${err}`));
      }
    }

    // Launch game
    setStateOverride("launching");
    const admission = capturePruneLeaseAdmission(leaseOwner);
    try {
      await reconfirmLaunchOptions(romId, appId, "DesktopPlayButton", admission);
    } catch {
      // Best-effort
    }

    launchGame();
    setTimeout(() => {
      setStateOverride(null);
    }, 2000);
  };

  const launchGame = () => {
    const overview = overviewFor(appId);
    const gameId = overview?.GetGameID?.() ?? String(appId);

    markLaunchSkipped(appId);

    const winClient = (window as unknown as { SteamClient?: SteamClientStub }).SteamClient;
    const globalClient = (globalThis as unknown as { SteamClient?: SteamClientStub }).SteamClient;
    const client = winClient || globalClient;

    if (client?.Apps?.RunGame) {
      client.Apps.RunGame(gameId, "", -1, 100);
    }
  };

  const handleStopClick = async () => {
    if (!romId) return;
    try {
      await stopRunningGame(romId);
      setStateOverride(null);
    } catch {
      showToast("Could not stop game");
    }
  };

  const handleUninstallClick = async () => {
    if (!romId) return;
    setShowMenu(false);
    setStateOverride("uninstalling");

    const admission = capturePruneLeaseAdmission(leaseOwner);
    try {
      const result = await removeRom(romId);
      if (result.success) {
        await withPruneLease(
          result.prune_lease_token,
          "ROM uninstall",
          async (signal) => {
            if (signal.aborted) return;
            await setLaunchOptionsConfirmed(appId, "").catch(() => false);
          },
          leaseOwner,
          admission,
        );
        globalThis.dispatchEvent(new CustomEvent("romm_rom_uninstalled", { detail: { rom_id: romId } }));
        invalidateCachedGameDetail(appId);
        showToast(`${detail.romName || "ROM"} uninstalled`);
        setStateOverride(null);
      } else {
        showToast(result.message || "Uninstall failed");
        setStateOverride(null);
      }
    } catch {
      showToast("Uninstall failed");
      setStateOverride(null);
    }
  };

  // Render download progress elements
  const downloadedBytes = activeDownload?.bytes_downloaded ?? 0;
  const totalBytes = activeDownload?.total_bytes ?? detail.fsSizeBytes ?? 0;
  const progressRatio = totalBytes > 0 ? Math.min(1, Math.max(0, downloadedBytes / totalBytes)) : 0;
  const progressPercent = Math.round(progressRatio * 100);
  const isExtracting = activeDownload?.status === "extracting";
  const isPaused = activeDownload?.status === "paused";
  const isResumable = activeDownload?.resumable ?? false;

  // Base container style matching Steam's action bar height
  const containerStyle: React.CSSProperties = {
    display: "inline-flex",
    flexDirection: "row",
    alignItems: "center",
    height: "48px",
    position: "relative",
    userSelect: "none",
    overflow: "visible",
  };

  // Consistent 200px button container size matching default Steam desktop play/install button
  const buttonGroupStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    width: "200px",
    minWidth: "200px",
    maxWidth: "200px",
    height: "48px",
    position: "relative",
    borderRadius: "2px",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.4)",
    overflow: "visible",
  };

  const buttonBaseStyle: React.CSSProperties = {
    height: "100%",
    flex: "1 1 auto",
    padding: "0 16px",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "0.5px",
    color: "#ffffff",
    borderRadius: "2px",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
    transition: "filter 0.15s ease, background 0.15s ease",
  };

  const sideActionStyle: React.CSSProperties = {
    height: "48px",
    width: "36px",
    minWidth: "36px",
    maxWidth: "36px",
    flex: "0 0 36px",
    border: "none",
    borderRadius: "0 2px 2px 0",
    background: "rgba(0, 0, 0, 0.25)",
    borderLeft: "1px solid rgba(255, 255, 255, 0.15)",
    color: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s ease",
  };

  const renderBadges = () => {
    const badgeColumnStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      marginLeft: "24px",
      userSelect: "none",
      whiteSpace: "nowrap",
    };

    const badgeHeaderStyle: React.CSSProperties = {
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      color: "#8f98a0",
      lineHeight: 1.2,
    };

    const badgeValueStyle: React.CSSProperties = {
      fontSize: "14px",
      fontWeight: 700,
      color: "#ffffff",
      lineHeight: 1.4,
      display: "flex",
      alignItems: "center",
      gap: "6px",
    };

    const statusDotStyle: React.CSSProperties = {
      display: "inline-block",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      flexShrink: 0,
    };

    const hasAchievements = Boolean(detail.raId);
    const countLabel =
      detail.achievementTotal > 0
        ? `${detail.achievementEarned}/${detail.achievementTotal}`
        : `${detail.achievementEarned}`;

    const currentSetupInfo = romId ? setupInfo : null;
    const currentBiosAnswer = romId ? biosAnswer : null;

    // Save Sync status calculation
    let saveSyncColor = "#8f98a0";
    let saveSyncText = "disabled";

    if (detail.saveSyncEnabled) {
      const rommAvailable = !isOffline;
      const hasLocalSave = Boolean(
        detail.installed &&
        (currentSetupInfo?.has_local_saves ||
          (detail.saveStatus?.files &&
            detail.saveStatus.files.some((f) => Boolean(f.local_path || f.local_size || f.local_mtime)))),
      );

      let lastSyncIso = detail.saveStatus?.last_sync_check_at;
      if (!lastSyncIso && detail.saveStatus?.files) {
        for (const f of detail.saveStatus.files) {
          if (f.last_sync_at) {
            if (!lastSyncIso || f.last_sync_at > lastSyncIso) {
              lastSyncIso = f.last_sync_at;
            }
          }
        }
      }
      const formattedSyncTime = lastSyncIso ? formatTimeAgo(lastSyncIso) : null;
      const syncTimeText = formattedSyncTime
        ? formattedSyncTime.toLowerCase().startsWith("just now")
          ? "Synced just now"
          : `Synced ${formattedSyncTime}`
        : null;

      if (!rommAvailable) {
        if (hasLocalSave) {
          saveSyncColor = "#d4a72c";
          saveSyncText = syncTimeText || "Not Synced";
        } else {
          saveSyncColor = BIOS_MISSING_RED;
          saveSyncText = "RomM Unavailable";
        }
      } else {
        const isConflict =
          hasLocalSave &&
          (currentSetupInfo?.recommended_action === "show_wizard" ||
            detail.saveSyncStatus === "conflict" ||
            hasAnySaveConflict(detail.saveStatus));

        if (isConflict) {
          saveSyncColor = "#d4a72c";
          saveSyncText = "Save Conflict";
        } else {
          saveSyncColor = "#5ba32b";
          saveSyncText = syncTimeText || "Ready";
        }
      }
    }

    // BIOS status calculation
    let biosColor = "#5ba32b";
    let biosText = "Ready (no BIOS)";

    const isBiosError =
      detail.biosRequiredMissing ||
      Boolean(currentBiosAnswer?.bios_status_unknown) ||
      currentBiosAnswer?.bios_level === "missing" ||
      currentBiosAnswer?.bios_level === "partial" ||
      currentBiosAnswer?.bios_level === "unknown";

    if (isBiosError) {
      biosColor = BIOS_MISSING_RED;
      biosText = "Error, see below";
    } else if (!detail.biosNeeded) {
      biosColor = "#5ba32b";
      biosText = "Ready (no BIOS)";
    } else {
      const requiredCount = currentBiosAnswer?.bios_status?.required_count ?? 0;
      const localCount = currentBiosAnswer?.bios_status?.local_count ?? 0;
      const isOptionalNotInstalled =
        currentBiosAnswer?.bios_status?.needs_bios === true && requiredCount === 0 && localCount === 0;

      if (currentBiosAnswer?.bios_status?.needs_bios === false || isOptionalNotInstalled) {
        biosColor = "#5ba32b";
        biosText = "Ready (no BIOS)";
      } else {
        biosColor = "#5ba32b";
        biosText = "Ready";
      }
    }

    return (
      <div className="tender-desktop-badges" style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
        {!detail.installed && detail.fsSizeBytes != null && (
          <div className="tender-desktop-badge-item tender-desktop-space-required" style={badgeColumnStyle}>
            <div style={badgeHeaderStyle}>SPACE REQUIRED</div>
            <div style={badgeValueStyle}>{formatBytes(detail.fsSizeBytes)}</div>
          </div>
        )}

        {playtimeInfo.lastPlayed ? (
          <div className="tender-desktop-badge-item tender-desktop-last-played" style={badgeColumnStyle}>
            <div style={badgeHeaderStyle}>LAST PLAYED</div>
            <div style={badgeValueStyle}>{playtimeInfo.lastPlayed}</div>
          </div>
        ) : null}

        {playtimeInfo.playtime ? (
          <div className="tender-desktop-badge-item tender-desktop-playtime" style={badgeColumnStyle}>
            <div style={badgeHeaderStyle}>PLAYTIME</div>
            <div style={badgeValueStyle}>{playtimeInfo.playtime}</div>
          </div>
        ) : null}

        {hasAchievements && (
          <div className="tender-desktop-badge-item tender-desktop-achievements" style={badgeColumnStyle}>
            <div style={badgeHeaderStyle}>ACHIEVEMENTS</div>
            <div style={badgeValueStyle}>
              <span style={{ fontSize: "13px" }}>{"\uD83C\uDFC6"}</span>
              <span>{countLabel}</span>
            </div>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          className="tender-desktop-badge-item tender-desktop-save-sync"
          style={{ ...badgeColumnStyle, cursor: "pointer" }}
          onClick={() => {
            globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
            }
          }}
        >
          <div style={badgeHeaderStyle}>SAVE SYNC</div>
          <div style={{ ...badgeValueStyle, color: saveSyncColor }}>
            <span className="romm-status-dot" style={{ ...statusDotStyle, backgroundColor: saveSyncColor }} />
            <span>{saveSyncText}</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          className="tender-desktop-badge-item tender-desktop-bios"
          style={{ ...badgeColumnStyle, cursor: "pointer" }}
          onClick={() => {
            globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
            }
          }}
        >
          <div style={badgeHeaderStyle}>BIOS</div>
          <div style={{ ...badgeValueStyle, color: biosColor }}>
            <span className="romm-status-dot" style={{ ...statusDotStyle, backgroundColor: biosColor }} />
            <span>{biosText}</span>
          </div>
        </div>
      </div>
    );
  };

  // 1. Downloading state
  if (effectiveState === "downloading") {
    let progressLabel = `${progressPercent}%`;
    if (isExtracting) progressLabel = `Extracting… ${progressPercent}%`;
    if (isPaused) progressLabel = `Paused (${progressPercent}%)`;

    const t = Math.min(1, Math.max(0, progressRatio));

    const fillGradient = isExtracting
      ? "linear-gradient(90deg, #59bf43 0%, #409930 100%)"
      : `linear-gradient(90deg, ${lerpColor(BLUE_LEFT, GREEN_LEFT, t)} 0%, ${lerpColor(BLUE_RIGHT, GREEN_RIGHT, t)} 100%)`;

    const { boxShadow: _baseShadow, ...buttonGroupNoShadow } = buttonGroupStyle;

    return (
      <div className="tender-desktop-play-btn-container" ref={containerRef} style={containerStyle}>
        <div
          className={`tender-desktop-play-btn-group ${!isPaused ? "tender-desktop-dl-pulsing" : ""}`.trim()}
          style={
            {
              ...buttonGroupNoShadow,
              overflow: "visible",
              ...(isPaused ? { boxShadow: "0 0 10px rgba(212, 167, 44, 0.7), 0 1px 4px rgba(0, 0, 0, 0.4)" } : {}),
            } as React.CSSProperties
          }
        >
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              ...buttonBaseStyle,
              position: "relative",
              overflow: "hidden",
              background: "#0e1c2e",
              borderRadius: isExtracting ? "2px" : "2px 0 0 2px",
              padding: "0 10px",
            }}
          >
            <div
              className="tender-desktop-dl-fill"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: `${progressPercent}%`,
                background: fillGradient,
                transition: "width 0.25s ease-out, background 0.25s ease-out",
              }}
            />
            <span
              style={{
                position: "relative",
                zIndex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontSize: "13px",
              }}
            >
              {progressLabel}
            </span>
          </div>

          {/* Pause/Resume if supported */}
          {isResumable && !isExtracting && (
            <button
              type="button"
              className="tender-desktop-dl-pause"
              title={isPaused ? "Resume download" : "Pause download"}
              aria-label={isPaused ? "Resume download" : "Pause download"}
              style={{
                ...sideActionStyle,
                width: "32px",
                minWidth: "32px",
                maxWidth: "32px",
                flex: "0 0 32px",
                borderRadius: 0,
              }}
              onClick={handlePauseResumeClick}
            >
              {isPaused ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 1.5L10 6L2 10.5V1.5Z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="3" height="8" rx="0.5" />
                  <rect x="7" y="2" width="3" height="8" rx="0.5" />
                </svg>
              )}
            </button>
          )}

          {/* Cancel button */}
          {!isExtracting && (
            <button
              type="button"
              className="tender-desktop-dl-cancel"
              title="Cancel download"
              aria-label="Cancel download"
              style={{
                ...sideActionStyle,
                width: isResumable ? "32px" : "36px",
                minWidth: isResumable ? "32px" : "36px",
                maxWidth: isResumable ? "32px" : "36px",
                flex: isResumable ? "0 0 32px" : "0 0 36px",
              }}
              onClick={handleCancelClick}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="10" y2="10" strokeLinecap="round" />
                <line x1="10" y1="2" x2="2" y2="10" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {renderBadges()}
      </div>
    );
  }

  // 2. Download Complete flash
  if (effectiveState === "dl_complete") {
    return (
      <div className="tender-desktop-play-btn-container" style={containerStyle}>
        <div className="tender-desktop-play-btn-group" style={buttonGroupStyle}>
          <button
            type="button"
            disabled
            style={{
              ...buttonBaseStyle,
              width: "100%",
              borderRadius: "2px",
              background: "linear-gradient(90deg, #70d61d 0%, #01a75b 100%)",
              filter: "brightness(1.2)",
            }}
          >
            READY!
          </button>
        </div>
        {renderBadges()}
      </div>
    );
  }

  // 3. Running / Resume state
  if (effectiveState === "running") {
    return (
      <div className="tender-desktop-play-btn-container" style={containerStyle}>
        <div className="tender-desktop-play-btn-group" style={buttonGroupStyle}>
          <button
            type="button"
            className="tender-desktop-btn-resume"
            style={{
              ...buttonBaseStyle,
              background: "linear-gradient(90deg, #59bf43 0%, #409930 100%)",
              borderRadius: "2px 0 0 2px",
            }}
            onClick={() => {
              void handlePlayClick();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 2L12 7L3 12V2Z" />
            </svg>
            RESUME
          </button>
          <button
            type="button"
            className="tender-desktop-btn-stop"
            title="Stop Game"
            aria-label="Stop Game"
            style={sideActionStyle}
            onClick={() => {
              void handleStopClick();
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect width="10" height="10" rx="1" />
            </svg>
          </button>
        </div>
        {renderBadges()}
      </div>
    );
  }

  // 4. Play state (Installed)
  if (effectiveState === "play" || effectiveState === "syncing" || effectiveState === "launching") {
    let playText = "PLAY";
    if (effectiveState === "syncing") playText = "SYNCING SAVES...";
    if (effectiveState === "launching") playText = "LAUNCHING...";

    return (
      <div className="tender-desktop-play-btn-container" style={containerStyle} ref={menuRef}>
        <div className="tender-desktop-play-btn-group" style={buttonGroupStyle}>
          <button
            type="button"
            className="tender-desktop-btn-play"
            disabled={effectiveState !== "play"}
            style={{
              ...buttonBaseStyle,
              background: "linear-gradient(90deg, #59bf43 0%, #409930 100%)",
              borderRadius: "2px 0 0 2px",
            }}
            onClick={() => {
              void handlePlayClick();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 2L12 7L3 12V2Z" />
            </svg>
            {playText}
          </button>

          {/* Dropdown Menu Toggle */}
          <button
            type="button"
            className="tender-desktop-menu-toggle"
            title="Game Options"
            aria-label="Game Options"
            style={sideActionStyle}
            onClick={() => setShowMenu((prev) => !prev)}
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
              <path
                d="M1 1L5 5L9 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div
              className="tender-desktop-play-menu"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                minWidth: "160px",
                background: "#1e2837",
                border: "1px solid #3c4856",
                borderRadius: "2px",
                boxShadow: "0 8px 16px rgba(0, 0, 0, 0.5)",
                zIndex: 1000,
                padding: "4px 0",
              }}
            >
              <button
                type="button"
                className="tender-desktop-menu-item-uninstall"
                style={{
                  width: "100%",
                  padding: "8px 16px",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  color: "#ff6b6b",
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onClick={() => {
                  void handleUninstallClick();
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1.5 3H10.5M4 3V1.5H8V3M4.5 5.5V9.5M7.5 5.5V9.5" strokeLinecap="round" />
                  <path d="M2.5 3L3.2 10.2C3.25 10.65 3.65 11 4.1 11H7.9C8.35 11 8.75 10.65 8.8 10.2L9.5 3" />
                </svg>
                Uninstall
              </button>
            </div>
          )}
        </div>
        {renderBadges()}
      </div>
    );
  }

  // 5. Conflict state
  if (effectiveState === "conflict") {
    return (
      <div className="tender-desktop-play-btn-container" style={containerStyle}>
        <div className="tender-desktop-play-btn-group" style={buttonGroupStyle}>
          <button
            type="button"
            className="tender-desktop-btn-conflict"
            style={{
              ...buttonBaseStyle,
              width: "100%",
              borderRadius: "2px",
              background: "linear-gradient(90deg, #d4a017 0%, #b8860b 100%)",
              fontSize: "13px",
            }}
            onClick={() => {
              showToast("Resolve save conflict before playing");
              if (romId) void refreshSaveStatus(appId);
            }}
          >
            RESOLVE CONFLICT
          </button>
        </div>
        {renderBadges()}
      </div>
    );
  }

  // 6. Uninstalling state
  if (effectiveState === "uninstalling") {
    return (
      <div className="tender-desktop-play-btn-container" style={containerStyle}>
        <div className="tender-desktop-play-btn-group" style={buttonGroupStyle}>
          <button
            type="button"
            disabled
            style={{
              ...buttonBaseStyle,
              width: "100%",
              borderRadius: "2px",
              background: "#2a3f5a",
              color: "#8fa3b8",
            }}
          >
            UNINSTALLING...
          </button>
        </div>
        {renderBadges()}
      </div>
    );
  }

  // 7. Default: Download state (Uninstalled)
  return (
    <div className="tender-desktop-play-btn-container" style={containerStyle}>
      <div className="tender-desktop-play-btn-group" style={buttonGroupStyle}>
        <button
          type="button"
          className="tender-desktop-btn-download"
          disabled={isOffline}
          style={{
            ...buttonBaseStyle,
            width: "100%",
            borderRadius: "2px",
            background: isOffline
              ? "linear-gradient(90deg, #4a5968 0%, #3a4754 100%)"
              : "linear-gradient(90deg, #1a9fff 0%, #0078d4 100%)",
            cursor: isOffline ? "not-allowed" : "pointer",
            opacity: isOffline ? 0.7 : 1,
          }}
          onClick={() => {
            void handleDownloadClick();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path
              d="M7 1V9M7 9L3.5 5.5M7 9L10.5 5.5M1 11H13M1 13H13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {isOffline ? "OFFLINE" : "DOWNLOAD"}
        </button>
      </div>
      {renderBadges()}
    </div>
  );
};
