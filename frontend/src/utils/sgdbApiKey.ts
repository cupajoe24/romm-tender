/**
 * Entering a SteamGridDB API key: the entered key is first tested against
 * SteamGridDB, and only a valid one is saved. A rejected key keeps the prompt
 * open with the returned message, so an invalid key never sits silently. The key
 * is write-only: never pre-filled, never echoed back.
 */

/** The subset of the verify answer the prompt saves on or stays open on. */
export interface VerifyKeyResult {
  success: boolean;
  message: string;
}

export interface SgdbKeySteps {
  /** Tests the entered key against SteamGridDB without persisting it. */
  verify: (key: string) => Promise<VerifyKeyResult>;
  /** Persists the entered key. Called only after `verify` succeeds. */
  save: (key: string) => Promise<void>;
}

export const SGDB_KEY_TITLE = "SteamGridDB API Key";
export const SGDB_KEY_HELP =
  "Paste the key from your SteamGridDB profile (Preferences → API). It is checked against SteamGridDB before it is " +
  "saved.";
export const SGDB_KEY_FIELD_LABEL = "API Key";
export const SGDB_KEY_SUBMIT_LABEL = "Save";
export const SGDB_KEY_VERIFYING_LABEL = "Verifying…";

export const GENERIC_VERIFY_ERROR = "Could not verify the key. Check your connection and try again.";
export const GENERIC_SAVE_KEY_ERROR = "The key is valid, but saving it failed. Check your connection and try again.";

/** Whether *value* can be submitted: whitespace alone is not a key. */
export const sgdbKeyComplete = (value: string): boolean => value.trim() !== "";

/**
 * Verify *key*, then save it. Answers `null` once it is saved — the prompt
 * closes — and otherwise the message the prompt shows while it stays open. A
 * save that fails after the key verified says so rather than claiming the key
 * could not be verified.
 */
export async function verifyThenSaveSgdbKey(key: string, steps: SgdbKeySteps): Promise<string | null> {
  let check: VerifyKeyResult;
  try {
    check = await steps.verify(key);
  } catch {
    return GENERIC_VERIFY_ERROR;
  }
  if (!check.success) return check.message;
  try {
    await steps.save(key);
  } catch {
    return GENERIC_SAVE_KEY_ERROR;
  }
  return null;
}
