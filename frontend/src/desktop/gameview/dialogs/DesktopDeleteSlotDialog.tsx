/**
 * Desktop confirmation dialog for deleting a save slot.
 * Shown from SaveManagementCard when the user confirms deleting an inactive slot.
 */

import type { FC } from "react";
import type { SlotDeleteInfo } from "../../../types";
import { formatSlotDeleteLines } from "../../../utils/saveHelpers";
import { BUTTON_STYLE } from "../styles";
import { DesktopDialog } from "./DesktopDialog";

export interface DesktopDeleteSlotDialogProps {
  deleteInfo: SlotDeleteInfo;
  onDismiss: () => void;
  onConfirm: () => Promise<void> | void;
}

export const DesktopDeleteSlotDialog: FC<DesktopDeleteSlotDialogProps> = ({ deleteInfo, onDismiss, onConfirm }) => {
  return (
    <DesktopDialog titleId="delete-slot-title" title="Delete Slot" onDismiss={onDismiss}>
      {formatSlotDeleteLines(deleteInfo).map((line, idx) => (
        <p key={idx} style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#a0b0c0", lineHeight: 1.4 }}>
          {line}
        </p>
      ))}
      <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#d94126", fontWeight: 600 }}>
        This cannot be undone.
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button type="button" style={{ ...BUTTON_STYLE, backgroundColor: "transparent" }} onClick={onDismiss}>
          Cancel
        </button>
        <button
          type="button"
          style={{
            ...BUTTON_STYLE,
            backgroundColor: "#d94126",
            borderColor: "#d94126",
          }}
          onClick={() => void onConfirm()}
        >
          Delete
        </button>
      </div>
    </DesktopDialog>
  );
};
