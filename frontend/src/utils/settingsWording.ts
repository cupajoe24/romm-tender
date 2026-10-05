/**
 * What the settings say, on both surfaces: the QAM's Settings page and the
 * desktop's Tender Settings window. Each surface draws its own rows; the words
 * in them are this module's.
 */

/** A sentence with some of its words emphasised — each surface draws a `strong` run in its own bold. */
export type Phrase = readonly { readonly text: string; readonly strong?: boolean }[];

/** A phrase's words without their emphasis. */
export const phraseText = (phrase: Phrase): string => phrase.map((run) => run.text).join("");

// --- Connections: RomM ---

export const ROMM_HEADING = "RomM";
export const EDIT_LABEL = "Edit";

export const ROMM_URL_LABEL = "RomM URL";
export const ROMM_URL_UNSET = "(not set)";

export const CUSTOM_HEADERS_LABEL = "Custom headers";
export const customHeadersSummary = (count: number): string => (count > 0 ? `${count} set` : "(none)");

export const ROMM_ACCOUNT_LABEL = "RomM Account";
export const accountState = (hasToken: boolean): string => (hasToken ? "Signed in" : "Not signed in");
export const signInButtonLabel = (hasToken: boolean): string => (hasToken ? "Sign in again" : "Sign in");

export const SIGN_OUT_LABEL = "Sign out";
export const SIGN_OUT_DESCRIPTION = "Forgets the RomM token on this device. The token stays valid in RomM.";

// Sign-out only forgets the token on this device; it never revokes it in RomM.
export const SIGN_OUT_CONFIRM = {
  title: "Sign out of RomM?",
  description:
    "This only forgets the RomM token on this device. The token itself stays valid in RomM — " +
    "revoke it there (Settings → API Tokens) if you no longer want it.",
  confirm: SIGN_OUT_LABEL,
  cancel: "Cancel",
} as const;

export const INSECURE_SSL_LABEL = "Allow Insecure SSL";
export const INSECURE_SSL_DESCRIPTION =
  "Skip certificate checks for a self-signed server. Anyone who can intercept the connection can read what the " +
  "plugin sends — your RomM token, your password when you sign in with it, and any custom headers — and use your " +
  "account. Only on a network you trust.";

// --- Connections: SteamGridDB ---

export const SGDB_HEADING = "SteamGridDB";
export const SGDB_KEY_LABEL = "API Key";
export const sgdbKeyState = (maskedKey: string): string => (maskedKey ? "••••" : "Not configured");
