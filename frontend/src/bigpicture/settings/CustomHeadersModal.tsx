/**
 * The QAM's editor for the extra HTTP headers sent to the RomM server. Which
 * rows keep their stored value and what is sent for each are
 * `utils/customHeaders.ts`'s, as are the words.
 */

import { FC, useRef, useState, ChangeEvent } from "react";
import { TextField, DialogButton, Focusable } from "@decky/ui";
import { ValidatingModalShell } from "./ValidatingModalShell";
import type { CustomHeaderEntry } from "../../types";
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
} from "../../utils/customHeaders";

interface CustomHeadersModalProps {
  closeModal?: () => void;
  /** Names of the headers already stored, in the order they were entered. */
  storedNames: string[];
  /** Persists the whole list. Resolves with the backend's verdict. */
  onSave: (headers: CustomHeaderEntry[]) => Promise<SaveHeadersResult>;
}

const helperTextStyle = { fontSize: "12px", marginBottom: "12px", color: "rgba(255,255,255,0.6)" } as const;
const rowStyle = { marginBottom: "12px" } as const;
const removeButtonStyle = { marginTop: "6px", minWidth: "auto", width: "auto" } as const;
const emptyStyle = { fontSize: "12px", marginBottom: "8px", color: "rgba(255,255,255,0.6)" } as const;

// The dots belong inside the empty field, where they read as "something is in
// here you cannot see" rather than as part of the sentence below it.
//
// `placeholder` lives on React's InputHTMLAttributes while @decky/ui types
// TextField's props as the wider HTMLAttributes, so the prop has to be handed
// over past the type. That says nothing about whether Steam's own component
// forwards it to the <input> it renders — the component is fished out of a
// webpack module and its source is not readable here, so the cast could render
// nothing at all. It is kept only because it was seen working on the device;
// `inlineControls` is the declared prop to fall back to if it ever stops.
const storedValuePlaceholder = { placeholder: STORED_VALUE_PLACEHOLDER } as Record<string, string>;

export const CustomHeadersModal: FC<CustomHeadersModalProps> = ({ closeModal, storedNames, onSave }) => {
  const nextId = useRef(storedNames.length);
  const [rows, setRows] = useState<HeaderRow[]>(() => rowsFromStoredNames(storedNames));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (id: number, patch: Partial<HeaderRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    // Any edit clears a stale error so it doesn't linger past a correction.
    setError(null);
  };

  const addRow = () => {
    const id = nextId.current;
    nextId.current += 1;
    setRows((prev) => [...prev, { id, name: "", value: "", storedName: null }]);
    setError(null);
  };

  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setError(null);
  };

  // Save the whole list. Success closes; a refusal — the backend's own verdict or
  // a rejection — keeps the modal open with a message so the user can correct it.
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const failure = await saveHeaderRows(rows, onSave);
      if (failure === null) {
        closeModal?.();
      } else {
        setError(failure);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNameChange = (id: number) => (e: ChangeEvent<HTMLInputElement>) =>
    updateRow(id, { name: e.target.value });

  const handleValueChange = (id: number) => (e: ChangeEvent<HTMLInputElement>) =>
    updateRow(id, { value: e.target.value });

  return (
    <ValidatingModalShell
      {...(closeModal === undefined ? {} : { closeModal })}
      title={CUSTOM_HEADERS_TITLE}
      error={error}
      errorTestId="custom-headers-error"
      submitLabel={submitting ? SAVING_HEADERS_LABEL : SAVE_HEADERS_LABEL}
      submitDisabled={submitting}
      onSubmit={() => {
        void submit();
      }}
    >
      <div style={helperTextStyle}>{CUSTOM_HEADERS_HELP}</div>
      {rows.length === 0 && <div style={emptyStyle}>{NO_CUSTOM_HEADERS}</div>}
      {rows.map((row) => (
        // Focusable per row so the gamepad steps name → value → Remove within one
        // header before moving on to the next.
        <Focusable key={row.id} style={rowStyle} data-testid={`header-row-${row.id}`}>
          <TextField label={HEADER_NAME_LABEL} value={row.name} onChange={handleNameChange(row.id)} />
          <TextField
            label={HEADER_VALUE_LABEL}
            {...(keepsStoredValue(row) ? { description: STORED_VALUE_HINT, ...storedValuePlaceholder } : {})}
            value={row.value}
            bIsPassword
            onChange={handleValueChange(row.id)}
          />
          <DialogButton style={removeButtonStyle} onClick={() => removeRow(row.id)}>
            {REMOVE_HEADER_LABEL}
          </DialogButton>
        </Focusable>
      ))}
      <DialogButton onClick={addRow}>{ADD_HEADER_LABEL}</DialogButton>
    </ValidatingModalShell>
  );
};
