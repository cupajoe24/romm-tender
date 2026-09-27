/**
 * Desktop core change confirmation dialog.
 * Shown when an emulator core change is detected before launching a game.
 * Parity equivalent of Big Picture's `CoreChangeModal`.
 */

import type { FC } from "react";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_MUTED_STYLE,
  DIALOG_TEXT_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "./DesktopDialog";

export interface DesktopCoreChangeDialogProps {
  oldLabel: string;
  newLabel: string;
  onChoice: (proceed: boolean) => void;
}

export const DesktopCoreChangeDialog: FC<DesktopCoreChangeDialogProps> = ({ oldLabel, newLabel, onChoice }) => {
  return (
    <DesktopDialog
      titleId="tender-desktop-core-change-title"
      title="Emulator Core Changed"
      onDismiss={() => onChoice(false)}
    >
      <div style={{ ...DIALOG_MUTED_STYLE, marginBottom: "16px" }}>
        {oldLabel} → {newLabel}
      </div>

      <div
        style={{
          padding: "10px",
          background: "rgba(255, 152, 0, 0.15)",
          borderRadius: "4px",
          border: "1px solid rgba(255, 152, 0, 0.3)",
          marginBottom: "16px",
        }}
      >
        <div style={{ fontSize: "12px", color: "#ffb74d", marginBottom: "6px", fontWeight: "bold" }}>
          Save Compatibility Warning
        </div>
        <div style={{ ...DIALOG_TEXT_STYLE, marginBottom: 0 }}>
          Some emulator cores use incompatible save formats. Continuing may overwrite your existing saves with data the
          previous core can&apos;t read.
        </div>
      </div>

      <div style={DIALOG_ACTIONS_STYLE}>
        <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice(true)}>
          Continue
        </button>
        <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice(false)}>
          Cancel
        </button>
      </div>
    </DesktopDialog>
  );
};
