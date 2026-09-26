/**
 * Indicator badges rendered alongside the desktop Play / Download button.
 *
 * Displays:
 *   - Space required (when ROM is not installed)
 *   - Last played timestamp and total playtime forever
 *   - RetroAchievements progress (with shortcut to open achievements modal)
 *   - Save sync status indicator (dot + label, shortcut to Emulation Settings)
 *   - BIOS status indicator (dot + label, shortcut to Emulation Settings)
 */

import type { CSSProperties, FC } from "react";
import type { BiosAnswer } from "../../api/backend";
import type { SaveSetupInfo, SaveStatus } from "../../types";
import { formatBytes, formatTimeAgo } from "../../utils/formatters";
import { BIOS_MISSING_RED, biosColorForLevel } from "../../utils/biosColor";
import { hasAnySaveConflict } from "../../utils/saveStatus";
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
  biosAnswer: BiosAnswer | null;
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
  biosAnswer,
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
      const isUnconfirmedWizard = Boolean(
        setupInfo && !setupInfo.slot_confirmed && setupInfo.recommended_action === "show_wizard",
      );
      const isConflict =
        hasLocalSave &&
        (isUnconfirmedWizard || detail.saveSyncStatus === "conflict" || hasAnySaveConflict(detail.saveStatus));

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
  let biosColor = biosColorForLevel("ok");
  let biosText = "Ready (no BIOS)";

  const isBiosError = detail.biosRequiredMissing || biosAnswer?.bios_level === "missing";
  const isUnknown = biosAnswer?.bios_level === "unknown" || Boolean(biosAnswer?.bios_status_unknown);

  if (isBiosError) {
    biosColor = biosColorForLevel("missing");
    biosText = "Error, see below";
  } else if (isUnknown) {
    biosColor = biosColorForLevel("unknown");
    biosText = "Unknown";
  } else if (!detail.biosNeeded) {
    biosColor = biosColorForLevel("ok");
    biosText = "Ready (no BIOS)";
  } else {
    const level = biosAnswer?.bios_level ?? null;
    const requiredCount = biosAnswer?.bios_status?.required_count ?? 0;
    const localCount = biosAnswer?.bios_status?.local_count ?? 0;
    const isOptionalNotInstalled =
      biosAnswer?.bios_status?.needs_bios === true && requiredCount === 0 && localCount === 0;

    if (biosAnswer?.bios_status?.needs_bios === false || isOptionalNotInstalled) {
      biosColor = biosColorForLevel("ok");
      biosText = "Ready (no BIOS)";
    } else if (level === "partial") {
      biosColor = biosColorForLevel("partial");
      biosText = detail.biosLabel || "Partial";
    } else {
      biosColor = biosColorForLevel(level ?? "ok");
      biosText = "Ready";
    }
  }

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
        <div style={{ ...BADGE_VALUE_STYLE, color: biosColor }}>
          <span className="romm-status-dot" style={{ ...STATUS_DOT_STYLE, backgroundColor: biosColor }} />
          <span>{biosText}</span>
        </div>
      </div>
    </div>
  );
};
