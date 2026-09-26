/**
 * Play button and dropdown menu for installed games in Steam Desktop view.
 *
 * Displays "PLAY", "SYNCING SAVES...", or "LAUNCHING...", along with a chevron
 * toggle opening the action menu (e.g. Uninstall).
 */

import type { FC } from "react";
import { BUTTON_GROUP_STYLE, BUTTON_BASE_STYLE, SIDE_ACTION_STYLE } from "./styles";

export interface PlayStateButtonProps {
  effectiveState: "play" | "syncing" | "launching";
  showMenu: boolean;
  onPlay: () => void;
  onToggleMenu: () => void;
  onUninstall: () => void;
}

export const PlayStateButton: FC<PlayStateButtonProps> = ({
  effectiveState,
  showMenu,
  onPlay,
  onToggleMenu,
  onUninstall,
}) => {
  let playText = "PLAY";
  if (effectiveState === "syncing") playText = "SYNCING SAVES...";
  if (effectiveState === "launching") playText = "LAUNCHING...";

  return (
    <div
      className="tender-desktop-play-btn-group"
      style={{
        ...BUTTON_GROUP_STYLE,
        zIndex: showMenu ? 1000 : 20,
      }}
    >
      <button
        type="button"
        className="tender-desktop-btn-play"
        disabled={effectiveState !== "play"}
        style={{
          ...BUTTON_BASE_STYLE,
          background: "linear-gradient(90deg, #59bf43 0%, #409930 100%)",
          borderRadius: "2px 0 0 2px",
        }}
        onClick={onPlay}
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
        aria-expanded={showMenu}
        style={SIDE_ACTION_STYLE}
        onClick={onToggleMenu}
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
            left: 0,
            right: 0,
            width: "100%",
            boxSizing: "border-box",
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
              boxSizing: "border-box",
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
            onClick={onUninstall}
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
  );
};
