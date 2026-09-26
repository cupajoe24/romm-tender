/**
 * Desktop offline-drift confirmation dialog.
 * Shown when RomM is unreachable and the local save has unsynced changes.
 * Parity equivalent of Big Picture's `OfflineDriftModal`.
 */

import type { FC } from "react";
import { DIALOG_ACTIONS_STYLE, DIALOG_TEXT_STYLE, DesktopDialog, dialogButtonStyle } from "./DesktopDialog";

export interface DesktopOfflineDriftDialogProps {
  onChoice: (choice: "start_anyway" | "retry" | "cancel") => void;
}

export const DesktopOfflineDriftDialog: FC<DesktopOfflineDriftDialogProps> = ({ onChoice }) => (
  <DesktopDialog
    titleId="tender-desktop-offline-drift-title"
    title="RomM Unreachable"
    onDismiss={() => onChoice("cancel")}
  >
    <div style={DIALOG_TEXT_STYLE}>
      Your local save has unsynced changes. Playing now may create a conflict you'll resolve later. Start anyway?
    </div>
    <div style={DIALOG_ACTIONS_STYLE}>
      <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice("start_anyway")}>
        Start Anyway
      </button>
      <button type="button" style={dialogButtonStyle("secondary")} onClick={() => onChoice("retry")}>
        Retry connection
      </button>
      <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice("cancel")}>
        Cancel
      </button>
    </div>
  </DesktopDialog>
);
