/**
 * Desktop modal for creating a new save slot.
 * Shown from SaveManagementCard when the user clicks "+ New Slot".
 */

import { useState, type FC } from "react";
import { BUTTON_STYLE } from "../styles";
import { DesktopDialog } from "./DesktopDialog";

export interface DesktopNewSlotDialogProps {
  onDismiss: () => void;
  onCreate: (slotName: string) => Promise<void> | void;
  error?: string | null;
}

export const DesktopNewSlotDialog: FC<DesktopNewSlotDialogProps> = ({ onDismiss, onCreate, error }) => {
  const [slotName, setSlotName] = useState("");

  const handleSubmit = () => {
    const trimmed = slotName.trim();
    if (trimmed) {
      void onCreate(trimmed);
    }
  };

  return (
    <DesktopDialog titleId="new-slot-title" title="New Save Slot" onDismiss={onDismiss}>
      <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#a0b0c0" }}>
        Enter a name for the new save slot. It will become the active slot immediately.
      </p>

      <input
        type="text"
        placeholder="Slot Name (e.g. speedrun, casual)"
        value={slotName}
        onChange={(e) => setSlotName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          fontSize: "13px",
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "3px",
          color: "#ffffff",
          outline: "none",
          marginBottom: "12px",
        }}
      />

      {error && <div style={{ color: "#d94126", fontSize: "12px", marginBottom: "12px" }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button type="button" style={{ ...BUTTON_STYLE, backgroundColor: "transparent" }} onClick={onDismiss}>
          Cancel
        </button>
        <button
          type="button"
          style={{
            ...BUTTON_STYLE,
            backgroundColor: "#1a9fff",
            borderColor: "#1a9fff",
            opacity: slotName.trim() === "" ? 0.6 : 1,
          }}
          disabled={slotName.trim() === ""}
          onClick={handleSubmit}
        >
          Create Slot
        </button>
      </div>
    </DesktopDialog>
  );
};
