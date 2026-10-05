/**
 * Signing in to RomM, whichever surface asks: the three ways in, the order they
 * are offered in, what each asks for and says, and the attempt itself with the
 * deadline it runs under.
 *
 * A pairing code or a pasted token is for an OIDC account, which has no password
 * to mint a token from. The credentials and the pasted token are write-only:
 * never pre-filled, never echoed back by the backend. The pairing code is
 * short-lived and single-use, so it is entered in the clear.
 */

import { connectWithCredentials, connectWithPairingCode, connectWithToken } from "../api/backend";
import { isValidServerUrl, trimServerUrl } from "./serverUrl";
import type { Phrase } from "./settingsWording";
import { TimeoutError, withTimeout } from "./withTimeout";

export type SignInMode = "credentials" | "token" | "pairing";

/** What one sign-in sends, by the way it signs in. */
export type SignInRequest =
  | { readonly mode: "credentials"; readonly username: string; readonly password: string }
  | { readonly mode: "token"; readonly token: string }
  | { readonly mode: "pairing"; readonly code: string };

/** The subset of the backend's connect answer a sign-in prompt closes or stays open on. */
export interface SignInResult {
  success: boolean;
  message: string;
}

/** The fields a sign-in prompt holds while it is open. */
export interface SignInFields {
  readonly username: string;
  readonly password: string;
  readonly token: string;
  /** The pairing code as entered, in any spelling `normalizePairingCode` reduces. */
  readonly code: string;
}

/** The mode a sign-in prompt opens on. */
export const DEFAULT_SIGN_IN_MODE: SignInMode = "pairing";

/** The modes in the order the prompt offers them. */
export const SIGN_IN_MODE_OPTIONS: readonly { readonly mode: SignInMode; readonly label: string }[] = [
  { mode: "pairing", label: "Pairing code" },
  { mode: "token", label: "API token" },
  { mode: "credentials", label: "Username & password" },
];

export const SIGN_IN_TITLE = "Sign in to RomM";
export const SIGN_IN_MODE_LABEL = "Sign-in method";
export const SIGN_IN_SUBMIT_LABEL = "Sign in";
export const SIGN_IN_SUBMITTING_LABEL = "Signing in…";
export const USERNAME_LABEL = "Username";
export const PASSWORD_LABEL = "Password";
export const API_TOKEN_LABEL = "API Token";
export const PAIRING_CODE_LABEL = "Pairing code";

/** What each mode's prompt says above its fields. */
export const SIGN_IN_HELP: Readonly<Record<SignInMode, Phrase>> = {
  token: [
    {
      text:
        "Create a token in RomM's web UI (Settings → API Tokens) and paste it here. Make sure it has the scopes " +
        "listed in the plugin docs so downloads, saves, and device sync work. The plugin never deletes a pasted " +
        "token; you manage it in RomM.",
    },
  ],
  pairing: [
    { text: "In RomM's web UI open your API token and click " },
    { text: "Pair", strong: true },
    {
      text:
        ", then enter the 8-character code here within 60 seconds. The plugin fetches the token itself — nothing to " +
        "copy or paste.",
    },
  ],
  credentials: [
    {
      text:
        "Enter your RomM username and password once. The plugin exchanges them for an API token and never stores " +
        "your password.",
    },
  ],
};

/** The pairing code's length, and where it splits into two groups around a hyphen. */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_GROUP = 4;

export const INVALID_URL_MESSAGE = "Enter a valid http:// or https:// server URL";
export const GENERIC_SIGN_IN_ERROR = "Sign-in failed. Check your connection and try again.";

// endpoint() never times out on its own (api/hostSocket.ts), so a backend that
// is down or not answering leaves the sign-in promise pending and the prompt
// stuck on "Signing in…" with no way out but Cancel. The deadline is the only
// thing that turns that into a message.
//
// The deadline is set above the backend's own per-request windows rather than at
// a snappy UI value. A sign-in is a heartbeat (RommHttpClient.with_retry: 3
// attempts x 30s) + the credential step (30s, never retried) + /api/users/me
// (3 x 30s), and each of those failures returns a specific message this one
// cannot match ("Server unreachable", "Sign-in rejected", the version gate). A
// deadline under the single 30s request window would pre-empt all of them —
// and, because losing the race abandons the call instead of cancelling it,
// would report failure for a sign-in that then succeeds and persists its token,
// with the single-use pairing code already burned.
export const SIGN_IN_TIMEOUT_MS = 60_000;
export const SIGN_IN_TIMEOUT_ERROR = "Tender's backend never answered. Restart it, or restart Steam, then try again.";

/**
 * Reduce a pairing-code fragment to uppercased alphanumerics — strips any
 * whitespace, hyphen, or stray punctuation a paste or keystroke introduced. The
 * backend normalizes identically.
 */
export const normalizePairingCode = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * Whether *mode*'s fields are complete enough to submit. The password is checked
 * untrimmed (a leading or trailing space can be a real character); everything
 * else is trimmed, so whitespace alone never completes a field.
 */
export function signInComplete(mode: SignInMode, fields: SignInFields): boolean {
  if (mode === "credentials") return fields.username.trim() !== "" && fields.password !== "";
  if (mode === "token") return fields.token.trim() !== "";
  return normalizePairingCode(fields.code).length === PAIRING_CODE_LENGTH;
}

/** The request *mode*'s fields make. The backend normalizes a pairing code, so it is sent as entered. */
export function signInRequest(mode: SignInMode, fields: SignInFields): SignInRequest {
  if (mode === "token") return { mode, token: fields.token };
  if (mode === "pairing") return { mode, code: fields.code };
  return { mode, username: fields.username, password: fields.password };
}

/**
 * Sign in to the RomM server at *url* with *request*. A URL that is not one is
 * refused before any call, and a call that throws answers the generic failure;
 * the backend's own answer is returned as it came.
 */
export async function signInToRomm(
  url: string,
  allowInsecureSsl: boolean,
  request: SignInRequest,
): Promise<SignInResult> {
  const trimmed = trimServerUrl(url);
  if (!isValidServerUrl(trimmed)) {
    return { success: false, message: INVALID_URL_MESSAGE };
  }
  try {
    if (request.mode === "credentials") {
      return await connectWithCredentials(trimmed, request.username, request.password, allowInsecureSsl);
    }
    if (request.mode === "token") {
      return await connectWithToken(trimmed, request.token, allowInsecureSsl);
    }
    return await connectWithPairingCode(trimmed, request.code, allowInsecureSsl);
  } catch {
    return { success: false, message: GENERIC_SIGN_IN_ERROR };
  }
}

/**
 * Run one sign-in attempt from a prompt, under the deadline. Answers `null` when
 * it succeeded — the prompt closes — and otherwise the message the prompt shows
 * while it stays open: the backend's own verdict, the deadline's, or the generic
 * one for a rejection.
 */
export async function submitSignIn(attempt: () => Promise<SignInResult>): Promise<string | null> {
  try {
    const result = await withTimeout(attempt(), SIGN_IN_TIMEOUT_MS);
    return result.success ? null : result.message;
  } catch (e) {
    return e instanceof TimeoutError ? SIGN_IN_TIMEOUT_ERROR : GENERIC_SIGN_IN_ERROR;
  }
}
