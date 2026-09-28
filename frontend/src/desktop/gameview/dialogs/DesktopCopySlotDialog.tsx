/**
 * Desktop modal for copying a save to another slot.
 * Shown from SaveManagementCard when the user chooses "Copy to slot...".
 */

import { useState, type FC } from "react";
import type { SaveSlotSummary } from "../../../types";
import { displaySlot } from "../../../utils/saveHelpers";
import { BUTTON_STYLE } from "../styles";
import { DesktopDialog } from "./DesktopDialog";

export interface DesktopCopySlotDialogProps {
  sourceSlot: string;
  availableSlots: SaveSlotSummary[];
  onDismiss: () => void;
  onCopy: (targetSlot: string) => Promise<void> | void;
}

export const DesktopCopySlotDialog: FC<DesktopCopySlotDialogProps> = ({
  sourceSlot,
  availableSlots,
  onDismiss,
  onCopy,
}) => {
  const [newSlotInput, setNewSlotInput] = useState("");

  const handleCreateAndCopy = () => {
    const trimmed = newSlotInput.trim();
    if (trimmed) {
      void onCopy(trimmed);
    }
  };

  return (
    <DesktopDialog titleId="copy-slot-title" title="Copy save to slot" onDismiss={onDismiss}>
      <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#a0b0c0", lineHeight: 1.4 }}>
        Copies this save into the chosen slot, which becomes the active slot. The original save is kept.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
        {availableSlots
          .filter((s) => s.slot !== "" && s.slot !== sourceSlot)
          .map((s) => (
            <button
              key={`target-slot-${s.slot}`}
              type="button"
              style={{
                ...BUTTON_STYLE,
                textAlign: "left",
                padding: "8px 12px",
                width: "100%",
              }}
              onClick={() => void onCopy(s.slot)}
            >
              {displaySlot(s.slot)}
            </button>
          ))}
      </div>

      <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "12px" }}>
        <div style={{ fontSize: "12px", color: "#8f98a0", marginBottom: "6px" }}>Or copy to a new slot:</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="New slot name…"
            value={newSlotInput}
            onChange={(e) => setNewSlotInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateAndCopy();
            }}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: "12px",
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "3px",
              color: "#ffffff",
              outline: "none",
            }}
          />
          <button
            type="button"
            style={{
              ...BUTTON_STYLE,
              opacity: newSlotInput.trim() === "" ? 0.6 : 1,
            }}
            disabled={newSlotInput.trim() === ""}
            onClick={handleCreateAndCopy}
          >
            Create & Copy
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
        <button type="button" style={{ ...BUTTON_STYLE, backgroundColor: "transparent" }} onClick={onDismiss}>
          Cancel
        </button>
      </div>
    </DesktopDialog>
  );
};
