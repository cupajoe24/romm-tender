/**
 * Signing in to RomM from the desktop's Connections tab, in the three ways and
 * with the words, default and deadline `utils/rommSignIn.ts` holds. A sign-in
 * that fails keeps the dialog open with its message; one that succeeds closes
 * it, and the tab's status line confirms it.
 *
 * The pairing code is one field rather than the QAM's eight boxes, which are
 * there for a gamepad: a keyboard types or pastes it whole, in any spelling.
 */

import { useState, type FC, type FormEvent } from "react";
import {
  API_TOKEN_LABEL,
  DEFAULT_SIGN_IN_MODE,
  PAIRING_CODE_GROUP,
  PAIRING_CODE_LABEL,
  PAIRING_CODE_LENGTH,
  PASSWORD_LABEL,
  SIGN_IN_HELP,
  SIGN_IN_MODE_LABEL,
  SIGN_IN_MODE_OPTIONS,
  SIGN_IN_SUBMITTING_LABEL,
  SIGN_IN_SUBMIT_LABEL,
  SIGN_IN_TITLE,
  USERNAME_LABEL,
  normalizePairingCode,
  signInComplete,
  signInRequest,
  submitSignIn,
  type SignInMode,
  type SignInRequest,
  type SignInResult,
} from "../../../utils/rommSignIn";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_ERROR_STYLE,
  DIALOG_INPUT_STYLE,
  DIALOG_LABEL_STYLE,
  DIALOG_TEXT_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "../../gameview/dialogs/DesktopDialog";
import { renderPhrase } from "../settingsPrompts";

export interface SignInDialogProps {
  signIn: (request: SignInRequest) => Promise<SignInResult>;
  /** The dialog is done: signed in, or left. */
  onClose: () => void;
}

const MODE_ROW_STYLE = { display: "flex", gap: "6px", marginBottom: "12px" } as const;

/** The code as it is shown: its two groups split by a hyphen once the second begins. */
const spellPairingCode = (code: string): string =>
  code.length > PAIRING_CODE_GROUP ? `${code.slice(0, PAIRING_CODE_GROUP)}-${code.slice(PAIRING_CODE_GROUP)}` : code;

export const SignInDialog: FC<SignInDialogProps> = ({ signIn, onClose }) => {
  const [mode, setMode] = useState<SignInMode>(DEFAULT_SIGN_IN_MODE);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = { username, password, token, code };
  const canSubmit = signInComplete(mode, fields) && !submitting;

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setError(null);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const failure = await submitSignIn(() => signIn(signInRequest(mode, fields)));
    setSubmitting(false);
    if (failure === null) onClose();
    else setError(failure);
  };

  const field = (label: string, value: string, onChange: (value: string) => void, type = "text") => (
    <label style={{ display: "block" }}>
      <span style={DIALOG_LABEL_STYLE}>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete="off"
        spellCheck={false}
        style={DIALOG_INPUT_STYLE}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );

  return (
    <DesktopDialog titleId="tender-settings-sign-in-title" title={SIGN_IN_TITLE} onDismiss={onClose}>
      <div role="group" aria-label={SIGN_IN_MODE_LABEL} style={MODE_ROW_STYLE}>
        {SIGN_IN_MODE_OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={option.mode === mode}
            style={{ ...dialogButtonStyle(option.mode === mode ? "primary" : "secondary"), textAlign: "center" }}
            onClick={() => {
              setMode(option.mode);
              setError(null);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div style={DIALOG_TEXT_STYLE}>{renderPhrase(SIGN_IN_HELP[mode])}</div>
      <form onSubmit={(e) => void submit(e)}>
        {mode === "pairing" &&
          field(PAIRING_CODE_LABEL, spellPairingCode(code), (value) =>
            edit(setCode)(normalizePairingCode(value).slice(0, PAIRING_CODE_LENGTH)),
          )}
        {mode === "token" && field(API_TOKEN_LABEL, token, edit(setToken), "password")}
        {mode === "credentials" && (
          <>
            {field(USERNAME_LABEL, username, edit(setUsername))}
            {field(PASSWORD_LABEL, password, edit(setPassword), "password")}
          </>
        )}
        {error !== null && (
          <div role="alert" style={DIALOG_ERROR_STYLE}>
            {error}
          </div>
        )}
        <div style={{ ...DIALOG_ACTIONS_STYLE, marginTop: "16px" }}>
          <button type="submit" disabled={!canSubmit} style={dialogButtonStyle("primary", !canSubmit)}>
            {submitting ? SIGN_IN_SUBMITTING_LABEL : SIGN_IN_SUBMIT_LABEL}
          </button>
          <button type="button" style={dialogButtonStyle("quiet")} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </DesktopDialog>
  );
};
