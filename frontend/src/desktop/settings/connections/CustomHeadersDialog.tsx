/**
 * The desktop's editor for the extra HTTP headers sent to the RomM server. Which
 * rows keep their stored value, what is sent for each and the words are
 * `utils/customHeaders.ts`'s; a refused list keeps the dialog open with the
 * backend's message.
 */

import { useRef, useState, type FC, type FormEvent } from "react";
import type { CustomHeaderEntry } from "../../../types";
import {
  ADD_HEADER_LABEL,
  CUSTOM_HEADERS_HELP,
  CUSTOM_HEADERS_TITLE,
  HEADER_NAME_LABEL,
  HEADER_VALUE_LABEL,
  NO_CUSTOM_HEADERS,
  REMOVE_HEADER_LABEL,
  SAVE_HEADERS_LABEL,
  SAVING_HEADERS_LABEL,
  STORED_VALUE_HINT,
  STORED_VALUE_PLACEHOLDER,
  keepsStoredValue,
  rowsFromStoredNames,
  saveHeaderRows,
  type HeaderRow,
  type SaveHeadersResult,
} from "../../../utils/customHeaders";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_ERROR_STYLE,
  DIALOG_INPUT_STYLE,
  DIALOG_LABEL_STYLE,
  DIALOG_MUTED_STYLE,
  DIALOG_TEXT_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "../../gameview/dialogs/DesktopDialog";

export interface CustomHeadersDialogProps {
  /** Names of the headers already stored, in the order they were entered. */
  storedNames: readonly string[];
  /** Persists the whole list. Resolves with the backend's verdict. */
  save: (headers: CustomHeaderEntry[]) => Promise<SaveHeadersResult>;
  /** The dialog is done: saved, or left. */
  onClose: () => void;
}

const ROW_STYLE = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: "8px",
  alignItems: "end",
  marginBottom: "8px",
} as const;

export const CustomHeadersDialog: FC<CustomHeadersDialogProps> = ({ storedNames, save, onClose }) => {
  const nextId = useRef(storedNames.length);
  const [rows, setRows] = useState<HeaderRow[]>(() => rowsFromStoredNames(storedNames));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeRows = (change: (prev: HeaderRow[]) => HeaderRow[]) => {
    setRows(change);
    setError(null);
  };
  const updateRow = (id: number, patch: Partial<HeaderRow>) =>
    changeRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const addRow = () => {
    const id = nextId.current;
    nextId.current += 1;
    changeRows((prev) => [...prev, { id, name: "", value: "", storedName: null }]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const failure = await saveHeaderRows(rows, save);
    setSubmitting(false);
    if (failure === null) onClose();
    else setError(failure);
  };

  return (
    <DesktopDialog titleId="tender-settings-custom-headers-title" title={CUSTOM_HEADERS_TITLE} onDismiss={onClose}>
      <div style={DIALOG_TEXT_STYLE}>{CUSTOM_HEADERS_HELP}</div>
      <form onSubmit={(e) => void submit(e)}>
        {rows.length === 0 && <div style={{ ...DIALOG_MUTED_STYLE, marginBottom: "8px" }}>{NO_CUSTOM_HEADERS}</div>}
        {rows.map((row) => {
          const kept = keepsStoredValue(row);
          return (
            <div key={row.id} style={ROW_STYLE} data-testid={`header-row-${row.id}`}>
              <label>
                <span style={DIALOG_LABEL_STYLE}>{HEADER_NAME_LABEL}</span>
                <input
                  type="text"
                  value={row.name}
                  autoComplete="off"
                  spellCheck={false}
                  style={DIALOG_INPUT_STYLE}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                />
              </label>
              <label>
                <span style={DIALOG_LABEL_STYLE}>{HEADER_VALUE_LABEL}</span>
                <input
                  type="password"
                  value={row.value}
                  autoComplete="off"
                  placeholder={kept ? STORED_VALUE_PLACEHOLDER : undefined}
                  title={kept ? STORED_VALUE_HINT : undefined}
                  style={DIALOG_INPUT_STYLE}
                  onChange={(e) => updateRow(row.id, { value: e.target.value })}
                />
              </label>
              <button
                type="button"
                style={dialogButtonStyle("secondary")}
                onClick={() => changeRows((prev) => prev.filter((r) => r.id !== row.id))}
              >
                {REMOVE_HEADER_LABEL}
              </button>
              {kept && <div style={{ ...DIALOG_MUTED_STYLE, gridColumn: "2 / 3" }}>{STORED_VALUE_HINT}</div>}
            </div>
          );
        })}
        <button type="button" style={{ ...dialogButtonStyle("secondary"), marginTop: "4px" }} onClick={addRow}>
          {ADD_HEADER_LABEL}
        </button>
        {error !== null && (
          <div role="alert" style={DIALOG_ERROR_STYLE}>
            {error}
          </div>
        )}
        <div style={{ ...DIALOG_ACTIONS_STYLE, marginTop: "16px" }}>
          <button type="submit" disabled={submitting} style={dialogButtonStyle("primary", submitting)}>
            {submitting ? SAVING_HEADERS_LABEL : SAVE_HEADERS_LABEL}
          </button>
          <button type="button" style={dialogButtonStyle("quiet")} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </DesktopDialog>
  );
};
