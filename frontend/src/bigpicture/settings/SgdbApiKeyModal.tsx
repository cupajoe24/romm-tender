/**
 * The QAM's prompt for a SteamGridDB API key, which verifies the key before it
 * saves it (`utils/sgdbApiKey.ts`). This modal owns only the in-flight field
 * value and the in-flight/error UI state.
 */

import { FC, useState, ChangeEvent, KeyboardEvent } from "react";
import { TextField, Focusable } from "@decky/ui";
import { ValidatingModalShell } from "./ValidatingModalShell";
import {
  SGDB_KEY_FIELD_LABEL,
  SGDB_KEY_HELP,
  SGDB_KEY_SUBMIT_LABEL,
  SGDB_KEY_TITLE,
  SGDB_KEY_VERIFYING_LABEL,
  sgdbKeyComplete,
  verifyThenSaveSgdbKey,
  type VerifyKeyResult,
} from "../../utils/sgdbApiKey";

interface SgdbApiKeyModalProps {
  closeModal?: () => void;
  /** Tests the entered key against SteamGridDB without persisting it. */
  onVerify: (key: string) => Promise<VerifyKeyResult>;
  /** Persists the entered key. Only called after ``onVerify`` succeeds. */
  onSave: (key: string) => Promise<void>;
}

const helperTextStyle = { fontSize: "12px", marginBottom: "12px", color: "rgba(255,255,255,0.6)" } as const;

export const SgdbApiKeyModal: FC<SgdbApiKeyModalProps> = ({ closeModal, onVerify, onSave }) => {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = sgdbKeyComplete(value);

  // Verify the entered key; on success persist it and close, on failure keep the
  // modal open with the returned message so the user can correct and retry.
  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const failure = await verifyThenSaveSgdbKey(value, { verify: onVerify, save: onSave });
      if (failure === null) {
        closeModal?.();
      } else {
        setError(failure);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    // Any edit clears a stale error so it doesn't linger past a correction.
    setError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Consume the event so Steam's ModalRoot cannot fire its own default
    // confirm/close on an incomplete field — regardless of whether we submit.
    e.preventDefault();
    e.stopPropagation();
    if (canSubmit) void submit();
  };

  return (
    <ValidatingModalShell
      {...(closeModal === undefined ? {} : { closeModal })}
      title={SGDB_KEY_TITLE}
      error={error}
      errorTestId="sgdb-key-error"
      submitLabel={submitting ? SGDB_KEY_VERIFYING_LABEL : SGDB_KEY_SUBMIT_LABEL}
      submitDisabled={!canSubmit || submitting}
      onSubmit={() => {
        void submit();
      }}
    >
      <div style={helperTextStyle}>{SGDB_KEY_HELP}</div>
      {/* Wrapped in <Focusable> like ConnectModal's token field: on the Deck,
          R2/OSK-Enter on an unwrapped single field otherwise closes the
          ModalRoot even when the Enter handler no-ops on an incomplete field. */}
      <Focusable>
        <TextField
          focusOnMount={true}
          label={SGDB_KEY_FIELD_LABEL}
          value={value}
          bIsPassword
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </Focusable>
    </ValidatingModalShell>
  );
};
