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
 *   - "conflict": Unresolved save conflict; displays "Resolve Conflict", which opens
 *     the save-conflict dialog.
 *   - Includes an actions menu dropdown (chevron) with "Uninstall".
 *
 * Decomposed into:
 *   - `PlayButtonBadges`: space required, last played, playtime, achievements, save sync & BIOS badges
 *   - `usePlayLaunch`: pre-launch sync, launch gate orchestration, and execution
 *   - `DownloadingButton`: progress bar and download controls
 *   - `PlayStateButton`: play/sync/launch button and options menu
 */

import { useState, useEffect, useRef, type CSSProperties, type FC, type MouseEvent } from "react";
import { addEventListener, removeEventListener } from "../../api/host";
import {
  cancelDownload,
  pauseDownload,
  resumeDownload,
  debugLog,
  getSaveSetupInfo,
  getAchievementProgress,
  getAchievements,
  probeReachability,
  getCachedGameDetail,
  isTargetOccupied,
  invalidateCachedGameDetail,
} from "../../api/backend";
import { runDownloadWithAdoption } from "../../utils/adoptFlow";
import { RESUME_TARGET_OCCUPIED_TOAST } from "../../utils/adoptWording";
import { useDialogHost, type AskDialog } from "./dialogs/useDialogHost";
import { desktopAdoptionDialogs } from "./dialogs/desktopDialogs";
import { useGameDetail } from "../../utils/gameDetailStore";
import { useDownloads } from "../../utils/downloadStore";
import { useRommConnectionState, reportServerReachable } from "../../utils/connectionState";
import { registerConnectionHeartbeat } from "../../utils/connectionHeartbeat";
import { isSessionActive } from "../../utils/sessionManager";
import { isAppRunning } from "../../utils/runningApps";
import { hasAnySaveConflict } from "../../utils/saveStatus";
import { setLaunchOptionsConfirmed } from "../../utils/steamShortcuts";
import { usePruneLeaseOwner } from "../../utils/pruneLease";
import { useOutsideClick } from "../../utils/useOutsideClick";
import { showToast } from "../../utils/toast";
import { detach } from "../../utils/detach";
import { useGamePlaytime } from "../../utils/playtimeReconcile";
import { findDesktopWindow } from "../desktopWindow";
import { DiscSelector } from "./DiscSelector";
import { CONTAINER_STYLE, BUTTON_GROUP_STYLE, BUTTON_BASE_STYLE, SIDE_ACTION_STYLE, ensurePulseStyles } from "./styles";
import { PlayButtonBadges } from "./PlayButtonBadges";
import { DownloadingButton } from "./DownloadingButton";
import { PlayStateButton } from "./PlayStateButton";
import { usePlayLaunch } from "./usePlayLaunch";
import type { DownloadCompleteEvent, DownloadFailedEvent, SaveSetupInfo, SaveStatus } from "../../types";

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

/**
 * A verdict this button reached itself — a conflict left unresolved, one just
 * resolved, a game just adopted — held only until the shared detail moves on.
 * The detail it was reached against is kept with it, so the next save status or
 * install state the store folds in replaces the verdict rather than sitting
 * under it.
 */
interface HeldVerdict {
  state: "play" | "conflict";
  saveStatus: SaveStatus | null;
  installed: boolean;
}

/** What the backend found on disk for this ROM, as last read or proven. */
interface FoundOnDisk {
  romId: number | null;
  targetOccupied: boolean;
  candidatePresent: boolean;
}

const READY_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  width: "100%",
  borderRadius: "2px",
  background: "linear-gradient(90deg, #70d61d 0%, #01a75b 100%)",
  filter: "brightness(1.2)",
};

const RESUME_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  background: "linear-gradient(90deg, #59bf43 0%, #409930 100%)",
  borderRadius: "2px 0 0 2px",
};

const CONFLICT_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  width: "100%",
  borderRadius: "2px",
  background: "linear-gradient(90deg, #d4a017 0%, #b8860b 100%)",
  fontSize: "13px",
};

const UNINSTALLING_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  width: "100%",
  borderRadius: "2px",
  background: "#2a3f5a",
  color: "#8fa3b8",
};

const DOWNLOAD_BUTTON_BASE_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  width: "100%",
  borderRadius: "2px",
};

const DOWNLOAD_BUTTON_OFFLINE_STYLE: CSSProperties = {
  ...DOWNLOAD_BUTTON_BASE_STYLE,
  background: "linear-gradient(90deg, #4a5968 0%, #3a4754 100%)",
  cursor: "not-allowed",
  opacity: 0.7,
};

const DOWNLOAD_BUTTON_PENDING_STYLE: CSSProperties = {
  ...DOWNLOAD_BUTTON_BASE_STYLE,
  background: "linear-gradient(90deg, #1a9fff 0%, #0078d4 100%)",
  cursor: "not-allowed",
  opacity: 0.7,
};

const DOWNLOAD_BUTTON_ONLINE_STYLE: CSSProperties = {
  ...DOWNLOAD_BUTTON_BASE_STYLE,
  background: "linear-gradient(90deg, #1a9fff 0%, #0078d4 100%)",
  cursor: "pointer",
  opacity: 1,
};

const DOWNLOAD_BUTTON_EXISTING_STYLE: CSSProperties = {
  ...DOWNLOAD_BUTTON_ONLINE_STYLE,
  fontSize: "13px",
};

// The dialog host sits above the button so that the button's branches, which
// render different trees, cannot unmount an open dialog when the state moves.
export const PlayButton: FC<PlayButtonProps> = ({ appId }) => {
  const dialogs = useDialogHost();
  return (
    <>
      <PlayButtonControls appId={appId} ask={dialogs.ask} />
      {dialogs.element}
    </>
  );
};

const PlayButtonControls: FC<PlayButtonProps & { ask: AskDialog }> = ({ appId, ask }) => {
  const detail = useGameDetail(appId);
  const romId = detail.romId;
  const downloads = useDownloads();
  const playtimeInfo = useGamePlaytime(appId, romId, "DesktopPlayButton");

  const [stateOverride, setStateOverride] = useState<PlayButtonState | null>(null);
  const [heldVerdict, setHeldVerdict] = useState<HeldVerdict | null>(null);
  // A download press's request, or an adoption, is in flight.
  const [actionPending, setActionPending] = useState(false);
  const downloadPressRef = useRef(false);
  const [foundOnDisk, setFoundOnDisk] = useState<FoundOnDisk>({
    romId: null,
    targetOccupied: false,
    candidatePresent: false,
  });
  const detailRef = useRef(detail);
  useEffect(() => {
    detailRef.current = detail;
  });
  const connectionState = useRommConnectionState();
  const isOffline = connectionState === "offline";
  const [setupInfo, setSetupInfo] = useState<SaveSetupInfo | null>(null);
  const [achievementCounts, setAchievementCounts] = useState<{ earned: number; total: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const leaseOwner = `desktop-play-button:${appId}`;

  // Both answers belong to the ROM they were read for and mean nothing once it
  // is installed, so a version switch or an install retires them without a
  // write. They stay two flags because they are two states: an occupied target
  // is compared where it lies, a candidate is renamed into place.
  const onDiskApplies = foundOnDisk.romId !== null && foundOnDisk.romId === romId && !detail.installed;
  const targetOccupied = onDiskApplies && foundOnDisk.targetOccupied;
  const candidatePresent = onDiskApplies && foundOnDisk.candidatePresent;
  const noteFoundOnDisk = (update: Partial<Omit<FoundOnDisk, "romId">>) => {
    setFoundOnDisk((prev) => {
      const base = prev.romId === romId ? prev : { romId, targetOccupied: false, candidatePresent: false };
      return { ...base, ...update };
    });
  };

  // The store's detail does not carry the two on-disk answers; the cached detail
  // it was read from does, and re-reading it is network-free. Re-read whenever
  // the ROM or its install state changes, which is also when the store reloads.
  useEffect(() => {
    if (!romId || detail.installed) return;
    let cancelled = false;
    getCachedGameDetail(appId)
      .then((cached) => {
        if (cancelled || !cached.found || cached.rom_id !== romId || cached.installed) return;
        setFoundOnDisk({
          romId,
          targetOccupied: cached.target_path_occupied === true,
          candidatePresent: cached.adoption_candidate_present === true,
        });
      })
      .catch((e) => {
        detach(debugLog(`DesktopPlayButton: on-disk read failed: ${e}`));
      });
    return () => {
      cancelled = true;
    };
  }, [appId, romId, detail.installed]);

  const holdVerdict = (state: HeldVerdict["state"]) => {
    const latest = detailRef.current;
    setHeldVerdict({ state, saveStatus: latest.saveStatus, installed: latest.installed });
  };
  const heldVerdictApplies =
    heldVerdict !== null && heldVerdict.saveStatus === detail.saveStatus && heldVerdict.installed === detail.installed;

  // Fetch SaveSetupInfo for indicator badges
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

      if (detail.raId) {
        Promise.all([getAchievementProgress(romId).catch(() => null), getAchievements(romId).catch(() => null)])
          .then(([prog, list]) => {
            if (cancelled) return;
            if (prog?.success || list?.success) {
              const earned = prog?.success ? prog.earned : 0;
              const total =
                prog?.success && prog.total > 0
                  ? prog.total
                  : list?.success
                    ? list.total || list.achievements.length
                    : 0;
              setAchievementCounts({ earned, total });
            }
          })
          .catch((e) => {
            detach(debugLog(`PlayButton achievement counts error: ${e}`));
          });
      }
    };

    fetchStatus();

    const handleSaveSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ rom_id?: number }>;
      if (customEvent.detail.rom_id === undefined || customEvent.detail.rom_id === romId) {
        fetchStatus();
      }
    };

    const handleAchievements = (e: Event) => {
      const customEvent = e as CustomEvent<{ romId?: number; earned: number; total: number }>;
      if (customEvent.detail.romId === undefined || customEvent.detail.romId === romId) {
        setAchievementCounts({ earned: customEvent.detail.earned, total: customEvent.detail.total });
      }
    };

    globalThis.addEventListener("romm_save_sync", handleSaveSync);
    globalThis.addEventListener("romm_data_changed", fetchStatus);
    globalThis.addEventListener("romm_achievements_updated", handleAchievements);

    return () => {
      cancelled = true;
      globalThis.removeEventListener("romm_save_sync", handleSaveSync);
      globalThis.removeEventListener("romm_data_changed", fetchStatus);
      globalThis.removeEventListener("romm_achievements_updated", handleAchievements);
    };
  }, [romId, detail.saveSyncEnabled, detail.raId]);

  usePruneLeaseOwner(leaseOwner);

  // Drive the reachability heartbeat while this game page is mounted (#1345)
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
      menuRef.current?.ownerDocument ||
      (typeof findDesktopWindow === "function" ? findDesktopWindow()?.document : null) ||
      (typeof document !== "undefined" ? document : null);
    ensurePulseStyles(doc);
  }, []);

  // Close actions menu on outside click
  useOutsideClick(menuRef, () => setShowMenu(false), showMenu);

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
  } else if (heldVerdictApplies) {
    effectiveState = heldVerdict.state;
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
        setActionPending(false);
        setStateOverride("dl_complete");
        setTimeout(() => {
          setStateOverride(null);
        }, 1500);
      }
    };

    const handleFailed = (e: DownloadFailedEvent) => {
      if (e.rom_id === romId) {
        setStateOverride(null);
        setActionPending(false);
        // A failed replace-download may already have removed what was found.
        setFoundOnDisk({ romId: null, targetOccupied: false, candidatePresent: false });
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

  // Launch gate orchestration hook
  const { handlePlayClick, handleResolveConflictClick, handleStopClick, handleUninstallClick } = usePlayLaunch({
    appId,
    romId,
    romName: detail.romName,
    effectiveState,
    ask,
    leaseOwner,
    setStateOverride,
    holdVerdict,
    setShowMenu,
  });

  // Download handlers
  const handleDownloadClick = async () => {
    if (!romId || isOffline || effectiveState === "downloading" || downloadPressRef.current) return;
    downloadPressRef.current = true;
    try {
      const outcome = await runDownloadWithAdoption({
        romId,
        romName: detail.romName,
        pageSawCandidate: candidatePresent,
        leaseOwner,
        logContext: "DesktopPlayButton",
        dialogs: desktopAdoptionDialogs(ask),
        hooks: {
          setBusy: setActionPending,
          setTargetOccupied: (occupied) => noteFoundOnDisk({ targetOccupied: occupied }),
          setCandidatePresent: (present) => noteFoundOnDisk({ candidatePresent: present }),
          onAdopted: () => holdVerdict("play"),
        },
      });
      if (outcome === "download_started") {
        setStateOverride("downloading");
        setActionPending(false);
      }
    } finally {
      downloadPressRef.current = false;
    }
  };

  const handleCancelClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!romId) return;
    detach(cancelDownload(romId).catch(() => {}));
    setStateOverride(null);
    setFoundOnDisk({ romId: null, targetOccupied: false, candidatePresent: false });
  };

  const handleResumeDownload = (rid: number) => {
    detach(
      resumeDownload(rid)
        .then((result) => {
          if (result.success) return;
          showToast(
            isTargetOccupied(result) ? RESUME_TARGET_OCCUPIED_TOAST : result.message || "Couldn't resume the download",
          );
        })
        .catch(() => showToast("Couldn't resume the download — is RomM server running?")),
    );
  };

  const handlePauseResumeClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!romId || !activeDownload) return;
    if (activeDownload.status === "paused") {
      handleResumeDownload(romId);
    } else {
      detach(pauseDownload(romId).catch(() => {}));
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

  const renderButtonGroup = () => {
    if (effectiveState === "downloading") {
      return (
        <DownloadingButton
          progressPercent={progressPercent}
          isExtracting={isExtracting}
          isPaused={isPaused}
          isResumable={isResumable}
          progressRatio={progressRatio}
          onPauseResume={handlePauseResumeClick}
          onCancel={handleCancelClick}
        />
      );
    }

    if (effectiveState === "dl_complete") {
      return (
        <div className="tender-desktop-play-btn-group" style={BUTTON_GROUP_STYLE}>
          <button type="button" disabled style={READY_BUTTON_STYLE}>
            READY!
          </button>
        </div>
      );
    }

    if (effectiveState === "running") {
      return (
        <div className="tender-desktop-play-btn-group" style={BUTTON_GROUP_STYLE}>
          <button
            type="button"
            className="tender-desktop-btn-resume"
            style={RESUME_BUTTON_STYLE}
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
            style={SIDE_ACTION_STYLE}
            onClick={() => {
              void handleStopClick();
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect width="10" height="10" rx="1" />
            </svg>
          </button>
        </div>
      );
    }

    if (effectiveState === "play" || effectiveState === "syncing" || effectiveState === "launching") {
      return (
        <PlayStateButton
          effectiveState={effectiveState}
          showMenu={showMenu}
          onPlay={() => {
            void handlePlayClick();
          }}
          onToggleMenu={() => setShowMenu((prev) => !prev)}
          onUninstall={() => {
            void handleUninstallClick();
          }}
        />
      );
    }

    if (effectiveState === "conflict") {
      return (
        <div className="tender-desktop-play-btn-group" style={BUTTON_GROUP_STYLE}>
          <button
            type="button"
            className="tender-desktop-btn-conflict"
            style={CONFLICT_BUTTON_STYLE}
            onClick={() => {
              detach(handleResolveConflictClick());
            }}
          >
            RESOLVE CONFLICT
          </button>
        </div>
      );
    }

    if (effectiveState === "uninstalling") {
      return (
        <div className="tender-desktop-play-btn-group" style={BUTTON_GROUP_STYLE}>
          <button type="button" disabled style={UNINSTALLING_BUTTON_STYLE}>
            UNINSTALLING...
          </button>
        </div>
      );
    }

    // Default: Download state (Uninstalled)
    const usesExisting = targetOccupied || candidatePresent;
    let downloadLabel = "DOWNLOAD";
    if (isOffline) downloadLabel = "OFFLINE";
    else if (actionPending) downloadLabel = "STARTING...";
    else if (usesExisting) downloadLabel = "USE EXISTING FILES";
    const downloadDisabled = isOffline || actionPending;

    const downloadStyle: CSSProperties = isOffline
      ? DOWNLOAD_BUTTON_OFFLINE_STYLE
      : actionPending
        ? DOWNLOAD_BUTTON_PENDING_STYLE
        : usesExisting
          ? DOWNLOAD_BUTTON_EXISTING_STYLE
          : DOWNLOAD_BUTTON_ONLINE_STYLE;

    return (
      <div className="tender-desktop-play-btn-group" style={BUTTON_GROUP_STYLE}>
        <button
          type="button"
          className="tender-desktop-btn-download"
          disabled={downloadDisabled}
          style={downloadStyle}
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
          {downloadLabel}
        </button>
      </div>
    );
  };

  return (
    <div
      className="tender-desktop-play-btn-container"
      style={{
        ...CONTAINER_STYLE,
        zIndex: showMenu ? 1000 : 20,
      }}
      ref={menuRef}
    >
      {renderButtonGroup()}
      <DiscSelector appId={appId} ask={ask} />
      <PlayButtonBadges
        detail={detail}
        playtimeInfo={playtimeInfo}
        achievementCounts={achievementCounts}
        setupInfo={romId ? setupInfo : null}
        isOffline={isOffline}
        romId={romId}
      />
    </div>
  );
};
