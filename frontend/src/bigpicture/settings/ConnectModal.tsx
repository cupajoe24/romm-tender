/**
 * The QAM's sign-in prompt for RomM, in one of the three ways
 * `utils/rommSignIn.ts` offers; what each asks for and says, the deadline and
 * the attempt are that module's.
 *
 * The pairing code is entered across eight single-character boxes (an
 * OTP-style input grouped 4 – 4 around a hyphen, auto-advancing as you type) —
 * typability matters more than obscuring a value that expires almost
 * immediately. Sign in is gated until the selected mode's fields are complete;
 * on success the parent's matching handler resolved truthy and the modal
 * closes, on failure it stays open and shows the returned message so the user
 * can correct and retry. The parent's handlers own token minting, validation,
 * status and persistence; this modal owns only the in-flight field values, the
 * selected mode, and the in-flight/error UI state.
 */

import { FC, Fragment, useState, useRef, ChangeEvent, KeyboardEvent } from "react";
import { TextField, DropdownItem, Focusable } from "@decky/ui";
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
  submitSignIn,
  normalizePairingCode,
  signInComplete,
  type SignInMode,
  type SignInResult,
} from "../../utils/rommSignIn";
import type { Phrase } from "../../utils/settingsWording";
import { ValidatingModalShell } from "./ValidatingModalShell";

interface ConnectModalProps {
  closeModal?: () => void;
  onConnect: (username: string, password: string) => Promise<SignInResult>;
  onConnectToken: (token: string) => Promise<SignInResult>;
  onConnectPairing: (code: string) => Promise<SignInResult>;
}

const CODE_INDICES = Array.from({ length: PAIRING_CODE_LENGTH }, (_unused, i) => i);

const helperTextStyle = { fontSize: "12px", marginBottom: "12px", color: "rgba(255,255,255,0.6)" } as const;
const codeLabelStyle = {
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "8px",
  color: "rgba(255,255,255,0.6)",
} as const;
// A single non-wrapping row: eight fixed-size boxes plus the hyphen must always
// stay on one line (8·36 (boxes) + 8·6 (gaps between the 9 flex children) + ~8
// (hyphen) ≈ 344px, comfortably inside the modal body's 360px min width), so each
// box is a fixed size and never shrinks or grows as characters are typed.
const codeRowStyle = {
  display: "flex",
  flexWrap: "nowrap",
  justifyContent: "center",
  alignItems: "center",
  gap: "6px",
  width: "100%",
} as const;
// @decky/ui's TextField spreads the `style` prop straight onto its underlying
// <input>, so these metrics apply to the glyph directly. The input's default
// line-height/padding clips a single character when the cell is squeezed this
// narrow, so we take over its box model: an explicit box height (44px wrapper),
// zeroed padding, and a large centered font render the character fully and
// centered both ways.
// display:flex with the default align-items:stretch lets Steam's input fill the
// full box height (a portrait rectangle); centering it here would leave the input
// at its shorter intrinsic height and read as a square.
const codeBoxWrapperStyle = { flexShrink: 0, width: "36px", height: "48px", display: "flex" } as const;
const codeBoxFieldStyle = {
  minWidth: 0,
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  padding: "0",
  textAlign: "center",
  fontSize: "20px",
  lineHeight: "1.2",
} as const;
// Match the boxes' 44px flex-centered block so the hyphen shares their exact
// vertical centerline (a bare inline span aligns by text baseline, which reads
// as a minor offset next to the input boxes).
const codeSeparatorStyle = {
  flexShrink: 0,
  height: "48px",
  display: "flex",
  alignItems: "center",
  fontSize: "18px",
  lineHeight: 1,
  color: "rgba(255,255,255,0.6)",
} as const;

const renderPhrase = (phrase: Phrase) =>
  phrase.map((run) => (run.strong ? <strong key={run.text}>{run.text}</strong> : run.text));

export const ConnectModal: FC<ConnectModalProps> = ({ closeModal, onConnect, onConnectToken, onConnectPairing }) => {
  const [mode, setMode] = useState<SignInMode>(DEFAULT_SIGN_IN_MODE);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState<string[]>(() => new Array<string>(PAIRING_CODE_LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The @decky/ui TextField is a plain FC with no ref to its underlying input,
  // so focus is moved via a wrapping element (querySelectorAll('input')[i] — the
  // same DOM pattern the QAM uses for buttons) rather than a forwarded ref. The
  // pairing row holds the eight code inputs in DOM order; the credentials row
  // holds [username, password] so Enter on username can advance to password.
  const codeRowRef = useRef<HTMLDivElement>(null);
  const credentialsRowRef = useRef<HTMLDivElement>(null);

  const boxInputAt = (index: number): HTMLInputElement | null =>
    codeRowRef.current?.querySelectorAll("input")[index] ?? null;

  const focusBox = (index: number) => {
    boxInputAt(index)?.focus();
  };

  const focusBoxAtEnd = (index: number) => {
    const input = boxInputAt(index);
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  };

  const setBoxChar = (index: number, char: string) => {
    setCode((prev) => prev.map((current, idx) => (idx === index ? char : current)));
  };

  // Write `chars` into consecutive boxes starting at `start`, then land the caret
  // on the first still-empty box — or blur (dismissing the keyboard) once the
  // whole code is filled. Used for pastes and any multi-character keystroke.
  const distributeChars = (start: number, chars: string) => {
    setCode((prev) => {
      const next = [...prev];
      for (let offset = 0; offset < chars.length && start + offset < PAIRING_CODE_LENGTH; offset += 1) {
        next[start + offset] = chars.charAt(offset);
      }
      return next;
    });
    const filledThrough = start + chars.length;
    if (filledThrough >= PAIRING_CODE_LENGTH) {
      (document.activeElement as HTMLElement | null)?.blur();
    } else {
      focusBox(filledThrough);
    }
  };

  const canSubmit = signInComplete(mode, { username, password, token, code: code.join("") });

  const attempt = (): Promise<SignInResult> => {
    if (mode === "token") return onConnectToken(token);
    // Backend normalizes, so the bare eight characters in order are enough.
    if (mode === "pairing") return onConnectPairing(code.join(""));
    return onConnect(username, password);
  };

  // Run the selected mode's sign-in. Success closes the modal; failure — the
  // backend's own verdict, a rejection, or the deadline — keeps it open and
  // shows a message so the user can retry.
  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const failure = await submitSignIn(attempt);
      if (failure === null) {
        closeModal?.();
      } else {
        setError(failure);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBoxChange = (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
    // Any edit clears a stale error so it doesn't linger past a correction.
    setError(null);
    const incoming = normalizePairingCode(e.target.value);
    if (incoming.length <= 1) {
      // A single character (or a deletion, which leaves the box empty). Advancing
      // only on a real character, so a delete never jumps focus forward.
      setBoxChar(index, incoming);
      if (incoming.length === 1) focusBox(index + 1);
      return;
    }
    // Multiple characters at once — a paste, or typing past a box that already
    // holds a character. Drop a leading copy of the box's existing character (a
    // type-over prepends it) so only the fresh characters are distributed.
    const existing = code[index] ?? "";
    const fresh = existing.length > 0 && incoming.startsWith(existing) ? incoming.slice(existing.length) : incoming;
    distributeChars(index, fresh);
  };

  const handleBoxKeyDown = (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    // Standard OTP behavior: Backspace on an already-empty box steps focus back
    // to the previous box with the caret at the end.
    if (e.key === "Backspace" && (code[index] ?? "") === "" && index > 0) {
      focusBoxAtEnd(index - 1);
      return;
    }
    if (e.key === "Enter") {
      // Consume the event so Steam's ModalRoot cannot fire its own default
      // confirm/close — regardless of whether the code is complete enough to
      // submit (an incomplete field must be an inert no-op, not a close).
      e.preventDefault();
      e.stopPropagation();
      // Enter (the on-screen keyboard's "Eingabe" key) confirms once every box
      // is filled — an incomplete code is a no-op. submit() owns closing on
      // success, so this path must not close the modal itself.
      if (code.every((c) => c !== "")) void submit();
    }
  };

  // Enter on the username field advances to the password field rather than
  // submitting — the first field of a two-field form should never fire the
  // action. If the password input can't be found, it's a no-op (never a submit).
  const handleUsernameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Consume the event so Steam's ModalRoot cannot fire its own default
    // confirm/close before focus advances to the password field.
    e.preventDefault();
    e.stopPropagation();
    credentialsRowRef.current?.querySelectorAll("input")[1]?.focus();
  };

  // Enter on a completing field (password / token) submits, but only when the
  // mode's fields are complete — otherwise it's a no-op.
  const handleCompletingKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Consume the event so Steam's ModalRoot cannot fire its own default
    // confirm/close on an incomplete field — regardless of whether we submit.
    // (On the Deck, R2/OSK-Enter on the empty token field otherwise closed the
    // modal even though this handler correctly no-ops when canSubmit is false.)
    e.preventDefault();
    e.stopPropagation();
    if (canSubmit) void submit();
  };

  const handleModeChange = (option: { data: string }) => {
    setMode(option.data as SignInMode);
    setError(null);
  };

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setError(null);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError(null);
  };

  const handleTokenChange = (e: ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
    setError(null);
  };

  return (
    <ValidatingModalShell
      {...(closeModal === undefined ? {} : { closeModal })}
      title={SIGN_IN_TITLE}
      error={error}
      errorTestId="signin-error"
      submitLabel={submitting ? SIGN_IN_SUBMITTING_LABEL : SIGN_IN_SUBMIT_LABEL}
      submitDisabled={!canSubmit || submitting}
      onSubmit={() => {
        void submit();
      }}
    >
      <DropdownItem
        label={SIGN_IN_MODE_LABEL}
        rgOptions={SIGN_IN_MODE_OPTIONS.map(({ mode: data, label }) => ({ data, label }))}
        selectedOption={mode}
        onChange={handleModeChange}
      />
      {mode === "token" && (
        <>
          <div style={helperTextStyle}>{renderPhrase(SIGN_IN_HELP.token)}</div>
          {/* The token field is the only input in this mode and, unwrapped, is a
                direct child of the modal body. On the Deck, R2/OSK-Enter on the
                empty field closes the ModalRoot even though handleCompletingKeyDown
                no-ops (canSubmit false). The pairing boxes' <Focusable> wrapper is
                the one structure proven not to close on an incomplete field, so the
                token field is wrapped the same way. flow-children is irrelevant for
                a single field, so it is omitted. */}
          <Focusable>
            <TextField
              focusOnMount={true}
              label={API_TOKEN_LABEL}
              value={token}
              bIsPassword
              onChange={handleTokenChange}
              onKeyDown={handleCompletingKeyDown}
            />
          </Focusable>
        </>
      )}
      {mode === "pairing" && (
        <>
          <div style={helperTextStyle}>{renderPhrase(SIGN_IN_HELP.pairing)}</div>
          <div style={codeLabelStyle}>{PAIRING_CODE_LABEL}</div>
          {/* Focusable + flow-children="horizontal" tells Steam's gamepad nav to
                step between the boxes left/right (the analog stick/d-pad), not
                up/down — a plain div defaults to vertical traversal. */}
          <Focusable flow-children="horizontal" ref={codeRowRef} style={codeRowStyle} data-testid="pairing-code-row">
            {CODE_INDICES.map((i) => (
              <Fragment key={i}>
                {i === PAIRING_CODE_GROUP && <span style={codeSeparatorStyle}>-</span>}
                <div style={codeBoxWrapperStyle}>
                  <TextField
                    focusOnMount={i === 0}
                    style={codeBoxFieldStyle}
                    value={code[i] ?? ""}
                    onChange={handleBoxChange(i)}
                    onKeyDown={handleBoxKeyDown(i)}
                  />
                </div>
              </Fragment>
            ))}
          </Focusable>
        </>
      )}
      {mode === "credentials" && (
        <>
          <div style={helperTextStyle}>{renderPhrase(SIGN_IN_HELP.credentials)}</div>
          {/* A plain wrapping div carries the ref used to advance Enter from the
                username field to the password field (querySelectorAll('input')[1]). */}
          <div ref={credentialsRowRef} data-testid="credentials-row">
            <TextField
              focusOnMount={true}
              label={USERNAME_LABEL}
              value={username}
              onChange={handleUsernameChange}
              onKeyDown={handleUsernameKeyDown}
            />
            <TextField
              label={PASSWORD_LABEL}
              value={password}
              bIsPassword
              onChange={handlePasswordChange}
              onKeyDown={handleCompletingKeyDown}
            />
          </div>
        </>
      )}
    </ValidatingModalShell>
  );
};
