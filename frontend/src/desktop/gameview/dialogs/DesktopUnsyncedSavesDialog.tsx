/**
 * Desktop unsynced-saves switch confirmation dialog.
 * Shown when switching away from a version that has unsynced local save changes.
 * Parity equivalent of Big Picture's `UnsyncedSavesSwitchModal`.
 */

import type { FC } from "react";
import { DIALOG_ACTIONS_STYLE, DIALOG_TEXT_STYLE, DesktopDialog, dialogButtonStyle } from "./DesktopDialog";

export type UnsyncedSavesChoice = "sync_and_switch" | "switch_anyway" | "cancel";

export interface DesktopUnsyncedSavesDialogProps {
  versionName: string;
  serverReachable: boolean;
  onChoice: (choice: UnsyncedSavesChoice) => void;
}

export const DesktopUnsyncedSavesDialog: FC<DesktopUnsyncedSavesDialogProps> = ({
  versionName,
  serverReachable,
  onChoice,
}) => {
  const description = serverReachable
    ? `"${versionName}" has save changes that were never uploaded to RomM. They stay on disk, but won't sync until you switch back.`
    : `"${versionName}" has save changes that were never uploaded, and RomM is not reachable right now — so they can't be synced first. They stay on disk, but won't sync until you switch back.`;

  return (
    <DesktopDialog
      titleId="tender-desktop-unsynced-saves-title"
      title="Unsynced saves"
      onDismiss={() => onChoice("cancel")}
    >
      <div style={DIALOG_TEXT_STYLE}>{description}</div>
      <div style={DIALOG_ACTIONS_STYLE}>
        {serverReachable ? (
          <>
            <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice("sync_and_switch")}>
              Sync now & switch
            </button>
            <button type="button" style={dialogButtonStyle("secondary")} onClick={() => onChoice("switch_anyway")}>
              Switch anyway
            </button>
          </>
        ) : (
          <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice("switch_anyway")}>
            Switch anyway
          </button>
        )}
        <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice("cancel")}>
          Cancel
        </button>
      </div>
    </DesktopDialog>
  );
};
