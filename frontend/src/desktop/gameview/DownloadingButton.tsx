/**
 * Download progress and control button group for the desktop Play button.
 *
 * Displays progress percentage (or extraction status), pulsing glow when active,
 * pause/resume controls if resumable, and a cancel button.
 */

import type { CSSProperties, FC, MouseEvent } from "react";
import { BUTTON_GROUP_STYLE, BUTTON_BASE_STYLE, SIDE_ACTION_STYLE } from "./styles";
import { getDownloadFillGradient } from "../../utils/downloadProgress";

export interface DownloadingButtonProps {
  progressPercent: number;
  isExtracting: boolean;
  isPaused: boolean;
  isResumable: boolean;
  progressRatio: number;
  onPauseResume: (e: MouseEvent<HTMLButtonElement>) => void;
  onCancel: (e: MouseEvent<HTMLButtonElement>) => void;
}

export const DownloadingButton: FC<DownloadingButtonProps> = ({
  progressPercent,
  isExtracting,
  isPaused,
  isResumable,
  progressRatio,
  onPauseResume,
  onCancel,
}) => {
  let progressLabel = `${progressPercent}%`;
  if (isExtracting) progressLabel = `Extracting… ${progressPercent}%`;
  if (isPaused) progressLabel = `Paused (${progressPercent}%)`;

  const fillGradient = getDownloadFillGradient(progressRatio, isExtracting, "desktop");

  const { boxShadow: _baseShadow, ...buttonGroupNoShadow } = BUTTON_GROUP_STYLE;

  return (
    <div
      className={`tender-desktop-play-btn-group ${!isPaused ? "tender-desktop-dl-pulsing" : ""}`.trim()}
      style={
        {
          ...buttonGroupNoShadow,
          overflow: "visible",
          ...(isPaused ? { boxShadow: "0 0 10px rgba(212, 167, 44, 0.7), 0 1px 4px rgba(0, 0, 0, 0.4)" } : {}),
        } as CSSProperties
      }
    >
      <div
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          ...BUTTON_BASE_STYLE,
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
            ...SIDE_ACTION_STYLE,
            width: "32px",
            minWidth: "32px",
            maxWidth: "32px",
            flex: "0 0 32px",
            borderRadius: 0,
          }}
          onClick={onPauseResume}
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
            ...SIDE_ACTION_STYLE,
            width: isResumable ? "32px" : "36px",
            minWidth: isResumable ? "32px" : "36px",
            maxWidth: isResumable ? "32px" : "36px",
            flex: isResumable ? "0 0 32px" : "0 0 36px",
          }}
          onClick={onCancel}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="2" x2="10" y2="10" strokeLinecap="round" />
            <line x1="10" y1="2" x2="2" y2="10" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
};
