/**
 * The desktop client's unchecked-source prompt, asked before a start from
 * Tender's Play button when the launch check could not tell whether the source
 * that would start the game is switched off. `shared/UncheckedSourceModal` is
 * the other drawing of it — Big Picture's, and the one the launch watcher shows
 * on either surface.
 */

import type { FC } from "react";
import { UNCHECKED_START_SOURCE_QUESTION, UNCHECKED_START_SOURCE_TITLE } from "../../../utils/emulatorSourceWording";
import { CANCEL_LABEL } from "../../../utils/launchPromptWording";
import { DIALOG_ACTIONS_STYLE, DIALOG_TEXT_STYLE, DesktopDialog, dialogButtonStyle } from "./DesktopDialog";

export interface DesktopUncheckedSourceDialogProps {
  onChoice: (start: boolean) => void;
}

export const DesktopUncheckedSourceDialog: FC<DesktopUncheckedSourceDialogProps> = ({ onChoice }) => (
  <DesktopDialog
    titleId="tender-desktop-unchecked-source-title"
    title={UNCHECKED_START_SOURCE_TITLE}
    onDismiss={() => onChoice(false)}
  >
    <div style={DIALOG_TEXT_STYLE}>{UNCHECKED_START_SOURCE_QUESTION}</div>
    <div style={DIALOG_ACTIONS_STYLE}>
      <button type="button" style={dialogButtonStyle("primary")} onClick={() => onChoice(true)}>
        Start
      </button>
      <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice(false)}>
        {CANCEL_LABEL}
      </button>
    </div>
  </DesktopDialog>
);
