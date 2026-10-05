/**
 * The desktop's prompt for a SteamGridDB API key, which verifies the key before
 * it saves it and keeps the two failures apart (`utils/sgdbApiKey.ts`).
 */

import { useState, type FC, type FormEvent } from "react";
import {
  SGDB_KEY_FIELD_LABEL,
  SGDB_KEY_HELP,
  SGDB_KEY_SUBMIT_LABEL,
  SGDB_KEY_TITLE,
  SGDB_KEY_VERIFYING_LABEL,
  sgdbKeyComplete,
  verifyThenSaveSgdbKey,
  type SgdbKeySteps,
} from "../../../utils/sgdbApiKey";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_ERROR_STYLE,
  DIALOG_INPUT_STYLE,
  DIALOG_LABEL_STYLE,
  DIALOG_TEXT_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "../../gameview/dialogs/DesktopDialog";

export interface SgdbKeyDialogProps {
  steps: SgdbKeySteps;
  /** The dialog is done: saved, or left. */
  onClose: () => void;
}

export const SgdbKeyDialog: FC<SgdbKeyDialogProps> = ({ steps, onClose }) => {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = sgdbKeyComplete(value) && !submitting;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const failure = await verifyThenSaveSgdbKey(value, steps);
    setSubmitting(false);
    if (failure === null) onClose();
    else setError(failure);
  };

  return (
    <DesktopDialog titleId="tender-settings-sgdb-key-title" title={SGDB_KEY_TITLE} onDismiss={onClose}>
      <div style={DIALOG_TEXT_STYLE}>{SGDB_KEY_HELP}</div>
      <form onSubmit={(e) => void submit(e)}>
        <label style={{ display: "block" }}>
          <span style={DIALOG_LABEL_STYLE}>{SGDB_KEY_FIELD_LABEL}</span>
          <input
            type="password"
            value={value}
            autoComplete="off"
            style={DIALOG_INPUT_STYLE}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </label>
        {error !== null && (
          <div role="alert" style={DIALOG_ERROR_STYLE}>
            {error}
          </div>
        )}
        <div style={{ ...DIALOG_ACTIONS_STYLE, marginTop: "16px" }}>
          <button type="submit" disabled={!canSubmit} style={dialogButtonStyle("primary", !canSubmit)}>
            {submitting ? SGDB_KEY_VERIFYING_LABEL : SGDB_KEY_SUBMIT_LABEL}
          </button>
          <button type="button" style={dialogButtonStyle("quiet")} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </DesktopDialog>
  );
};
