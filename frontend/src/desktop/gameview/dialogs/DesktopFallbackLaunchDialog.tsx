/**
 * Desktop fallback launch confirmation dialog.
 * Shown when online pre-launch sync fails without surfacing a conflict.
 * Parity equivalent of Big Picture's `FallbackLaunchModal`.
 */

import type { FC } from "react";
import { DIALOG_ACTIONS_STYLE, DIALOG_TEXT_STYLE, DesktopDialog, dialogButtonStyle } from "./DesktopDialog";

export interface DesktopFallbackLaunchDialogProps {
  message?: string | undefined;
  onChoice: (proceed: boolean) => void;
}

export const DesktopFallbackLaunchDialog: FC<DesktopFallbackLaunchDialogProps> = ({ message, onChoice }) => {
  const description = message?.trim()
    ? `${message} — launch with local saves?`
    : "Couldn't sync saves with RomM server. Launch with local saves?";

  return (
    <DesktopDialog
      titleId="tender-desktop-fallback-launch-title"
      title="Save Sync Unavailable"
      onDismiss={() => onChoice(false)}
    >
      <div style={DIALOG_TEXT_STYLE}>{description}</div>
      <div style={DIALOG_ACTIONS_STYLE}>
        <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice(true)}>
          Launch Anyway
        </button>
        <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice(false)}>
          Cancel
        </button>
      </div>
    </DesktopDialog>
  );
};
