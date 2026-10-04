/**
 * A yes-or-no question in the desktop dialog frame: a title, what pressing yes
 * does, and the two buttons. The words are the caller's; Escape, a click on the
 * backdrop and the second button all answer no.
 */

import type { FC } from "react";
import { DIALOG_ACTIONS_STYLE, DIALOG_TEXT_STYLE, DesktopDialog, dialogButtonStyle } from "./DesktopDialog";

export interface DesktopConfirmDialogProps {
  /** Unique per question; ties the box's accessible name to its heading. */
  titleId: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` for a yes that cannot be taken back. */
  tone?: "primary" | "danger";
  onChoice: (confirmed: boolean) => void;
}

export const DesktopConfirmDialog: FC<DesktopConfirmDialogProps> = ({
  titleId,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onChoice,
}) => (
  <DesktopDialog titleId={titleId} title={title} onDismiss={() => onChoice(false)}>
    <div style={DIALOG_TEXT_STYLE}>{description}</div>
    <div style={DIALOG_ACTIONS_STYLE}>
      <button type="button" style={dialogButtonStyle(tone)} onClick={() => onChoice(true)}>
        {confirmLabel}
      </button>
      <button type="button" style={dialogButtonStyle("quiet")} onClick={() => onChoice(false)}>
        {cancelLabel}
      </button>
    </div>
  </DesktopDialog>
);
