import type { CSSProperties } from "react";
import { findDesktopWindow } from "../desktopWindow";

export const SOLID_PLAY_BAR_BG = "rgb(39, 44, 53)";
export const GLASS_PLAY_BAR_BG = "rgba(36, 40, 47, 0.65)";
export const GLASS_PLAY_BAR_GRADIENT =
  "radial-gradient(100% 80% at 64% 95%, rgba(107, 115, 127, 0.3) 0%, rgba(62, 70, 80, 0.5) 20%, rgba(36, 40, 47, 0.5) 100%)";
export const PINNED_PLAY_BAR_SHADOW = "rgba(0, 0, 0, 0.267) 0px 6px 16px, rgba(0, 0, 0, 0.533) 0px 2px 6px";

export const CARD_STYLE: CSSProperties = {
  padding: "24px",
  background: GLASS_PLAY_BAR_GRADIENT,
  backgroundColor: GLASS_PLAY_BAR_BG,
  border: "1px solid rgba(255, 255, 255, 0.09)",
  borderTop: "1px solid rgba(255, 255, 255, 0.16)",
  borderBottom: "1px solid rgba(0, 0, 0, 0.5)",
  borderRadius: "4px",
  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "#c7d5e0",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
