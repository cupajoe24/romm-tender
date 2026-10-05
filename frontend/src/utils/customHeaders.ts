/**
 * Editing the extra HTTP headers sent to the RomM server, for a server behind an
 * authenticating reverse proxy (Pangolin, Cloudflare Access, Authelia, Authentik
 * forward-auth) that rejects the plugin's requests before RomM ever sees them.
 *
 * A stored header arrives with its NAME only — a value is a proxy credential and
 * the backend never sends one back — so a row starts with an empty value field
 * and keeps what is stored until the user types into it. That is the whole
 * meaning of the two value actions on the wire: a stored row still under its own
 * name with an untouched value field saves as `keep`, anything else as `set`.
 * Save is a whole-list replace, so a removed row is gone; the backend refuses the
 * list as a whole and the editor shows the refusal and stays open, which is why
 * the rules are not restated here.
 */

import type { CustomHeaderEntry } from "../types";

/** The subset of the backend verdict the editor closes or stays open on. */
export interface SaveHeadersResult {
  success: boolean;
  message?: string;
}

export interface HeaderRow {
  /** Stable across adds and removals, so a row keeps its identity as the list changes. */
  id: number;
  name: string;
  value: string;
  /** The name the backend holds this row's value under, or null for a new row. */
  storedName: string | null;
}

export const CUSTOM_HEADERS_TITLE = "Custom headers";
export const CUSTOM_HEADERS_HELP =
  "Extra headers sent with every request to your RomM server — for a server behind a proxy that authenticates " +
  "requests itself. They never go anywhere else. Authorization is not available: it already carries your RomM API " +
  "token.";
export const NO_CUSTOM_HEADERS = "No custom headers.";
export const HEADER_NAME_LABEL = "Header name";
export const HEADER_VALUE_LABEL = "Value";
export const REMOVE_HEADER_LABEL = "Remove";
export const ADD_HEADER_LABEL = "Add header";
export const SAVE_HEADERS_LABEL = "Save";
export const SAVING_HEADERS_LABEL = "Saving…";
/** What a stored value's empty field says about it, and what stands in for the value. */
export const STORED_VALUE_HINT = "stored — leave blank to keep it";
export const STORED_VALUE_PLACEHOLDER = "••••";
export const GENERIC_SAVE_HEADERS_ERROR = "Could not save the headers. Check your connection and try again.";

/** The editor's rows for the headers stored under *storedNames*, in their order. */
export const rowsFromStoredNames = (storedNames: readonly string[]): HeaderRow[] =>
  storedNames.map((name, index) => ({ id: index, name, value: "", storedName: name }));

/**
 * Whether this row's stored value still applies: it must have one, still be under
 * the name it was stored as, and have an untouched value field. A renamed row
 * saves as `set` with whatever the value field holds, because the backend keys a
 * kept value by name and has nothing to hand a new name.
 */
export const keepsStoredValue = (row: HeaderRow): boolean =>
  row.storedName !== null && row.value === "" && row.name === row.storedName;

/** The list the backend is sent for *rows*. */
export const toEntries = (rows: readonly HeaderRow[]): CustomHeaderEntry[] =>
  rows.map((row) =>
    keepsStoredValue(row)
      ? { name: row.name, value_action: "keep" }
      : { name: row.name, value_action: "set", value: row.value },
  );

/**
 * Save the whole list through *onSave*. Answers `null` when it was accepted — the
 * editor closes — and otherwise the message the editor shows while it stays
 * open: the backend's own refusal, or the generic one for a rejection.
 */
export async function saveHeaderRows(
  rows: readonly HeaderRow[],
  onSave: (headers: CustomHeaderEntry[]) => Promise<SaveHeadersResult>,
): Promise<string | null> {
  try {
    const result = await onSave(toEntries(rows));
    return result.success ? null : (result.message ?? GENERIC_SAVE_HEADERS_ERROR);
  } catch {
    return GENERIC_SAVE_HEADERS_ERROR;
  }
}
