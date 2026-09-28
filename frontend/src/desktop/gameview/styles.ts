import type { CSSProperties } from "react";
import { findDesktopWindow } from "../desktopWindow";

export const SOLID_PLAY_BAR_BG = "rgb(39, 44, 53)";
export const GLASS_PLAY_BAR_BG = "rgba(36, 40, 47, 0.65)";
export const GLASS_PLAY_BAR_GRADIENT =
  "radial-gradient(100% 80% at 64% 95%, rgba(107, 115, 127, 0.3) 0%, rgba(62, 70, 80, 0.5) 20%, rgba(36, 40, 47, 0.5) 100%)";
export const PINNED_PLAY_BAR_SHADOW = "rgba(0, 0, 0, 0.267) 0px 6px 16px, rgba(0, 0, 0, 0.533) 0px 2px 6px";

export const STEAM_CARD_BORDER_IMAGE =
  'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF7GlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDIgNzkuMTYwOTI0LCAyMDE3LzA3LzEzLTAxOjA2OjM5ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ0MgMjAxOCAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDE5LTA2LTI5VDAxOjMxOjA4LTA3OjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAxOS0wNy0wMVQxNjoyNjoxNi0wNzowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAxOS0wNy0wMVQxNjoyNjoxNi0wNzowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDplOTY3MmNmNy02NjI1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")';

export const STEAM_CARD_BG =
  "radial-gradient(100% 80% at 64% 95%, rgba(153, 174, 204, 0.3) 0%, rgba(125, 150, 184, 0.13) 40%, rgba(83, 104, 104, 0.1) 100%)";
export const STEAM_CARD_SHADOW = "0 0 12px rgba(0, 0, 0, 0.145)";

export const CARD_STYLE: CSSProperties = {
  boxSizing: "border-box",
  padding: "20px",
  background: STEAM_CARD_BG,
  border: "1px solid transparent",
  borderImageSource: STEAM_CARD_BORDER_IMAGE,
  borderImageSlice: 7,
  borderImageWidth: "1px",
  borderImageRepeat: "stretch",
  borderRadius: "2px",
  boxShadow: STEAM_CARD_SHADOW,
  color: "#ffffff",
  fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
};

export const WARNING_CARD_STYLE: CSSProperties = {
  ...CARD_STYLE,
  background: "linear-gradient(135deg, rgba(255, 170, 0, 0.08) 0%, rgba(36, 40, 47, 0.75) 100%)",
  backgroundColor: "rgba(36, 40, 47, 0.75)",
  border: "1px solid rgba(255, 170, 0, 0.35)",
  borderLeft: "4px solid #ffaa00",
  borderImageSource: "none",
  borderRadius: "2px",
};

export const ACTIVE_SESSION_CARD_STYLE: CSSProperties = {
  ...CARD_STYLE,
  background: "linear-gradient(135deg, rgba(56, 152, 236, 0.12) 0%, rgba(36, 40, 47, 0.75) 100%)",
  backgroundColor: "rgba(36, 40, 47, 0.75)",
  border: "1px solid rgba(56, 152, 236, 0.35)",
  borderLeft: "4px solid #3898ec",
  borderImageSource: "none",
  borderRadius: "2px",
};

export const PLAYTIME_SCOPE_CARD_STYLE: CSSProperties = {
  ...CARD_STYLE,
  background: "linear-gradient(135deg, rgba(212, 167, 44, 0.1) 0%, rgba(36, 40, 47, 0.75) 100%)",
  backgroundColor: "rgba(36, 40, 47, 0.75)",
  border: "1px solid rgba(212, 167, 44, 0.35)",
  borderLeft: "4px solid #d4a72c",
  borderImageSource: "none",
  borderRadius: "2px",
};

export const MODAL_CONTAINER_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const BACKDROP_BUTTON_STYLE: CSSProperties = {
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

export const BUTTON_STYLE: CSSProperties = {
  padding: "5px 12px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "3px",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: "#ffffff",
  cursor: "pointer",
  transition: "all 0.15s ease",
  outline: "none",
  userSelect: "none",
};

export const CONTAINER_STYLE: CSSProperties = {
  display: "inline-flex",
  flexDirection: "row",
  alignItems: "center",
  height: "48px",
  position: "relative",
  paddingBottom: "2px",
  boxSizing: "border-box",
  userSelect: "none",
  overflow: "visible",
  zIndex: 20,
};

export const BUTTON_GROUP_STYLE: CSSProperties = {
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
  zIndex: 20,
};

export const BUTTON_BASE_STYLE: CSSProperties = {
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

export const SIDE_ACTION_STYLE: CSSProperties = {
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

export {
  BLUE_LEFT,
  BLUE_RIGHT,
  DESKTOP_GREEN_LEFT as GREEN_LEFT,
  DESKTOP_GREEN_RIGHT as GREEN_RIGHT,
  lerpColor,
} from "../../utils/downloadProgress";

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
    #tender-desktop-play-button-host,
    #tender-desktop-play-button {
      overflow: visible !important;
      position: relative !important;
      z-index: 20 !important;
    }
    #tender-desktop-substitute {
      position: relative !important;
      z-index: 1 !important;
    }
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="PlayBar"],
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="playbar"],
    [class*="PlayBar"]:has(#tender-desktop-play-button, #tender-desktop-play-button-host),
    [class*="playbar"]:has(#tender-desktop-play-button, #tender-desktop-play-button-host) {
      z-index: 10 !important;
      overflow: visible !important;
    }
    .romm-status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    /*
     * Belt-and-suspenders badge & controls hiding:
     * Steam asynchronously renders badges and controls into the play bar.
     * While navigationWatcher performs explicit DOM-level hiding via the restoration ledger,
     * this CSS rule serves as an immediate safety net to prevent visual flicker
     * and catch elements that mount between watcher polling ticks.
     */
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="StatusAndStats"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="GameStatsSection"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="GameStat"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="LastPlayed"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="Playtime"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="CloudStatus"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="MiniAchievements"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *),
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="PlayBarDetailLabel"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *) {
      display: none !important;
    }
    /* Pin Steam's right-side controls container to the right edge */
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="RightControls"],
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="AppButtonsContainer"],
    :has(#tender-desktop-play-button, #tender-desktop-play-button-host) [class*="AppButtons"]:not(#tender-desktop-play-button *):not(#tender-desktop-play-button-host *) {
      margin-left: auto !important;
    }
    .tender-desktop-disc-btn:hover {
      background: rgba(255, 255, 255, 0.14) !important;
      filter: brightness(1.2);
    }
    .tender-desktop-disc-btn:active {
      filter: brightness(0.9);
    }
    .tender-desktop-disc-menu-item:hover {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #ffffff !important;
    }
    .tender-desktop-menu-item-uninstall:hover {
      background: rgba(255, 255, 255, 0.08) !important;
    }
  `;
  targetDoc.head.appendChild(style);
}
