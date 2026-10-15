/**
 * The Data Management list pane: lists the six populations of items this device
 * holds in setting cards matching Steam's desktop UI, each with its heading,
 * descriptive summary and a "Manage" button.
 */

import type { FC } from "react";
import { DialogButton, Spinner } from "@decky/ui";
import { DATA_ROWS, type DataRowId } from "../../../utils/dataRows";
import { rowBaseDescription, rowStatus } from "../../../utils/dataInventoryView";
import type { DataPageState } from "../../../utils/useDataPage";
import {
  BLUE,
  CARD_BUTTON_STYLE,
  MUTED,
  MUTED_TEXT_STYLE,
  SETTING_CARD_STYLE,
  TEXT,
  noticeCardStyle,
} from "../settingsStyles";

export interface DataManagementListPaneProps {
  state: DataPageState;
  onOpen: (rowId: DataRowId) => void;
}

export const DataManagementListPane: FC<DataManagementListPaneProps> = ({ state, onOpen }) => {
  const busyMessage = state.busy
    ? state.removalProgress
      ? `${state.busyLabel}: ${state.removalProgress.removed} of ${state.removalProgress.total}...`
      : `${state.busyLabel}...`
    : null;

  return (
    <div data-testid="data-management-list">
      {busyMessage && (
        <div style={noticeCardStyle(BLUE)} data-testid="data-management-busy-banner">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Spinner width="1em" height="1em" />
            <span>{busyMessage}</span>
          </div>
        </div>
      )}
      {DATA_ROWS.map((row) => (
        <div key={row.id} data-testid={`data-row-${row.id}`} style={SETTING_CARD_STYLE}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT }}>{row.label}</div>
            <div style={{ fontSize: "12px", color: MUTED, marginTop: "4px", lineHeight: 1.4 }}>
              {rowBaseDescription(row.id)}
            </div>
            <div style={{ fontSize: "12px", color: TEXT, fontWeight: 500, marginTop: "4px" }}>
              {rowStatus(row.id, state)}
            </div>
          </div>
          <DialogButton style={CARD_BUTTON_STYLE} onClick={() => onOpen(row.id)}>
            Manage
          </DialogButton>
        </div>
      ))}
      {state.inventory.state === "failed" && (
        <div style={{ ...MUTED_TEXT_STYLE, marginTop: "12px" }}>
          Inventory figures could not be loaded from the local database.
        </div>
      )}
    </div>
  );
};
