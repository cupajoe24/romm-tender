/**
 * Indicator badges rendered alongside the desktop Play / Download button.
 *
 * Displays:
 *   - Space required (when ROM is not installed)
 *   - Last played timestamp and total playtime forever
 *   - RetroAchievements progress (with shortcut to open achievements modal)
 *   - Save sync status indicator (dot + label, shortcut to Emulation Settings)
 *   - BIOS warning indicator (dot + label, shortcut to Emulation Settings, only shown when required BIOS missing)
 */

import type { CSSProperties, FC } from "react";
import type { SaveSetupInfo, SaveStatus } from "../../types";
import { formatBytes, formatTimeAgo } from "../../utils/formatters";
import { BIOS_MISSING_RED } from "../../utils/biosColor";
import { hasAnySaveConflict } from "../../utils/saveStatus";
import { applySaveSyncDisplay } from "../../utils/playSection";
import { requestOpenAchievementsModal } from "./AchievementsCard";

export interface PlayButtonBadgesProps {
  detail: {
    installed: boolean;
    fsSizeBytes?: number | null;
    raId?: number | null;
    achievementEarned?: number;
    achievementTotal?: number;
    saveSyncEnabled: boolean;
    saveStatus: SaveStatus | null;
    saveSyncStatus: string | null;
    saveSyncLabel?: string;
    biosRequiredMissing?: boolean;
    biosNeeded?: boolean;
    biosLabel?: string | null;
  };
  playtimeInfo: {
    lastPlayed: string;
    playtime: string;
  };
  achievementCounts: { earned: number; total: number } | null;
  setupInfo: SaveSetupInfo | null;
  isOffline: boolean;
  romId: number | null;
}

const BADGE_COLUMN_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  marginLeft: "24px",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const BADGE_HEADER_STYLE: CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
  color: "#8f98a0",
  lineHeight: 1.2,
};

const BADGE_VALUE_STYLE: CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#ffffff",
  lineHeight: 1.4,
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const STATUS_DOT_STYLE: CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  flexShrink: 0,
};

export const PlayButtonBadges: FC<PlayButtonBadgesProps> = ({
  detail,
  playtimeInfo,
  achievementCounts,
  setupInfo,
  isOffline,
  romId,
}) => {
  const hasAchievements = Boolean(detail.raId);
  const earned = achievementCounts ? achievementCounts.earned : (detail.achievementEarned ?? 0);
  const total =
    achievementCounts && achievementCounts.total > 0 ? achievementCounts.total : (detail.achievementTotal ?? 0);
  const countLabel = total > 0 ? `${earned}/${total}` : `${earned}`;

  // Save Sync status calculation
  let saveSyncColor = "#8f98a0";
  let saveSyncText = "disabled";

  if (detail.saveSyncEnabled) {
    const rommAvailable = !isOffline;
    const hasLocalSave = Boolean(
      detail.installed &&
      (setupInfo?.has_local_saves ||
        (detail.saveStatus?.files &&
          detail.saveStatus.files.some((f) => Boolean(f.local_path || f.local_size || f.local_mtime)))),
    );

    const syncRes = applySaveSyncDisplay(detail.saveStatus?.save_sync_display, detail.saveStatus);
    const lastSyncIso =
      detail.saveStatus?.save_sync_display?.last_sync_check_at ?? detail.saveStatus?.last_sync_check_at;
    const formattedSyncTime = lastSyncIso ? formatTimeAgo(lastSyncIso) : null;
    const syncTimeText = formattedSyncTime
      ? formattedSyncTime.toLowerCase().startsWith("just now")
        ? "Synced just now"
        : `Synced ${formattedSyncTime}`
      : detail.saveSyncLabel || null;

    if (!rommAvailable) {
      if (hasLocalSave) {
        saveSyncColor = "#d4a72c";
        saveSyncText = syncTimeText || "Not Synced";
      } else {
        saveSyncColor = BIOS_MISSING_RED;
        saveSyncText = "RomM Unavailable";
      }
    } else {
      const isUnconfirmedWizard = Boolean(
        setupInfo && !setupInfo.slot_confirmed && setupInfo.recommended_action === "show_wizard",
      );
      const isConflict =
        hasLocalSave &&
        (isUnconfirmedWizard ||
          syncRes.status === "conflict" ||
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

  // BIOS warning. What decides it is one question with two established
  // absences behind it (`extractBiosInfo`): a file the launching emulator
  // requires is not on disk, or the console cannot start without one of the
  // images that emulator declares and none of them is there. Everything else
  // the BIOS answer says is non-actionable here and lives in EmulationSettings.
  //
  // One appearance, always red. This badge is not rendering the four-valued
  // verdict — it is a warning that shows only for a state that is never anything
  // but bad.
  return (
    <div className="tender-desktop-badges" style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
      {!detail.installed && detail.fsSizeBytes != null && (
        <div className="tender-desktop-badge-item tender-desktop-space-required" style={BADGE_COLUMN_STYLE}>
          <div style={BADGE_HEADER_STYLE}>SPACE REQUIRED</div>
          <div style={BADGE_VALUE_STYLE}>{formatBytes(detail.fsSizeBytes)}</div>
        </div>
      )}

      {playtimeInfo.lastPlayed ? (
        <div className="tender-desktop-badge-item tender-desktop-last-played" style={BADGE_COLUMN_STYLE}>
          <div style={BADGE_HEADER_STYLE}>LAST PLAYED</div>
          <div style={BADGE_VALUE_STYLE}>{playtimeInfo.lastPlayed}</div>
        </div>
      ) : null}

      {playtimeInfo.playtime ? (
        <div className="tender-desktop-badge-item tender-desktop-playtime" style={BADGE_COLUMN_STYLE}>
          <div style={BADGE_HEADER_STYLE}>PLAYTIME</div>
          <div style={BADGE_VALUE_STYLE}>{playtimeInfo.playtime}</div>
        </div>
      ) : null}

      {hasAchievements && (
        <div
          role="button"
          tabIndex={0}
          className="tender-desktop-badge-item tender-desktop-achievements"
          style={{ ...BADGE_COLUMN_STYLE, cursor: "pointer" }}
          onClick={() => {
            if (romId) {
              requestOpenAchievementsModal(romId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (romId) {
                requestOpenAchievementsModal(romId);
              }
            }
          }}
        >
          <div style={BADGE_HEADER_STYLE}>ACHIEVEMENTS</div>
          <div style={BADGE_VALUE_STYLE}>
            <span style={{ fontSize: "13px" }}>{"\uD83C\uDFC6"}</span>
            <span>{countLabel}</span>
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        className="tender-desktop-badge-item tender-desktop-save-sync"
        style={{ ...BADGE_COLUMN_STYLE, cursor: "pointer" }}
        onClick={() => {
          globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
          }
        }}
      >
        <div style={BADGE_HEADER_STYLE}>SAVE SYNC</div>
        <div style={{ ...BADGE_VALUE_STYLE, color: saveSyncColor }}>
          <span className="romm-status-dot" style={{ ...STATUS_DOT_STYLE, backgroundColor: saveSyncColor }} />
          <span>{saveSyncText}</span>
        </div>
      </div>

      {detail.biosRequiredMissing && (
        <div
          role="button"
          tabIndex={0}
          className="tender-desktop-badge-item tender-desktop-bios"
          style={{ ...BADGE_COLUMN_STYLE, cursor: "pointer" }}
          onClick={() => {
            globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "emulation-settings" } }));
            }
          }}
        >
          <div style={BADGE_HEADER_STYLE}>BIOS</div>
          <div style={BADGE_VALUE_STYLE}>
            <span className="romm-status-dot" style={{ ...STATUS_DOT_STYLE, backgroundColor: BIOS_MISSING_RED }} />
            <span>{detail.biosLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
};
