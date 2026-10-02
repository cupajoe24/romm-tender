/**
 * The desktop client's unsynced-saves prompt, asked when switching away from a
 * version whose local save changes were never uploaded. Big Picture's
 * `UnsyncedSavesSwitchModal` is the other drawing of it.
 */

import type { FC } from "react";
import {
  CANCEL_LABEL,
  SWITCH_ANYWAY_LABEL,
  SYNC_AND_SWITCH_LABEL,
  UNSYNCED_SAVES_TITLE,
  unsyncedSavesDescription,
} from "../../../utils/launchPromptWording";
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
}) => (
  <DesktopDialog
    titleId="tender-desktop-unsynced-saves-title"
    title={UNSYNCED_SAVES_TITLE}
    onDismiss={() => onChoice("cancel")}
  >
    <div style={DIALOG_TEXT_STYLE}>{unsyncedSavesDescription(versionName, serverReachable)}</div>
    <div style={DIALOG_ACTIONS_STYLE}>
      {serverReachable ? (
        <>
          <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice("sync_and_switch")}>
            {SYNC_AND_SWITCH_LABEL}
          </button>
          <button type="button" style={dialogButtonStyle("secondary")} onClick={() => onChoice("switch_anyway")}>
            {SWITCH_ANYWAY_LABEL}
          </button>
        </>
      ) : (
        <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice("switch_anyway")}>
          {SWITCH_ANYWAY_LABEL}
        </button>
      )}
      <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice("cancel")}>
        {CANCEL_LABEL}
      </button>
    </div>
  </DesktopDialog>
);
