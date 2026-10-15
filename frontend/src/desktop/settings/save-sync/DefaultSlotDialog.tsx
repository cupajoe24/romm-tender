/**
 * Desktop modal for editing the default save slot in Tender Settings.
 */

import { useState, type FC, type FormEvent } from "react";
import { DEFAULT_SAVE_SLOT_LABEL, SAVE_LABEL } from "../../../utils/settingsWording";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_INPUT_STYLE,
  DIALOG_LABEL_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "../../gameview/dialogs/DesktopDialog";

export interface DefaultSlotDialogProps {
  currentSlot: string;
  onSave: (slot: string) => void;
  onClose: () => void;
}

export const DefaultSlotDialog: FC<DefaultSlotDialogProps> = ({ currentSlot, onSave, onClose }) => {
  const [value, setValue] = useState(currentSlot);
  const trimmed = value.trim();
  const canSave = trimmed.length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(trimmed);
    onClose();
  };

  return (
    <DesktopDialog titleId="tender-settings-default-slot-title" title={DEFAULT_SAVE_SLOT_LABEL} onDismiss={onClose}>
      <form onSubmit={submit}>
        <label style={{ display: "block" }}>
          <span style={DIALOG_LABEL_STYLE}>Slot Name</span>
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)} style={DIALOG_INPUT_STYLE} />
        </label>
        <div style={{ ...DIALOG_ACTIONS_STYLE, marginTop: "16px" }}>
          <button type="submit" disabled={!canSave} style={dialogButtonStyle("primary", !canSave)}>
            {SAVE_LABEL}
          </button>
          <button type="button" onClick={onClose} style={dialogButtonStyle("quiet")}>
            Cancel
          </button>
        </div>
      </form>
    </DesktopDialog>
  );
};
