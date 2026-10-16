/**
 * The wording, line tones, body resolution and single-flight read of
 * "What the installer said" (UpdateOutput).
 *
 * Both surfaces share this logic: Big Picture displays it in UpdateOutputModal
 * with focus-stop chunking for gamepad navigation, and Desktop displays it
 * in DesktopUpdateOutputDialog with an ordinary scrolling area.
 */

import { getUpdateOutput, logError, type UpdateOutput, type UpdateOutputSection } from "../api/backend";
import { clockTime } from "./updateInstallView";

export const UPDATE_OUTPUT_TITLE = "What the installer said";

/** What the window says where the journal holds no run of the installer's for this failure. */
export const OUTPUT_MISSING: Partial<Record<string, string>> = {
  rotated: "This output is no longer in the system journal — it keeps only the last hours of logs.",
  terminal: "This update was run in a terminal, so its output is there, not in the journal.",
  empty: "The installer left nothing in the journal for this update.",
};

/** What the window says while the answer is on its way. */
export const OUTPUT_READING = "Reading what the installer said…";

/** What the window says where the failure it was opened for no longer stands. */
export const OUTPUT_GONE = "This failed update is no longer on record.";

/**
 * What the window says where no output can be shown and no other line says
 * why: the journal could not be read, the answer did not arrive or was another
 * failure than `not_found`, or it named a `missing` this panel has no line for.
 */
export const OUTPUT_UNREAD = "Tender could not read what the installer said.";

/** Tone token for installer terminal line coloring across surfaces. */
export type OutputLineTone = "danger" | "success" | "muted" | "default";

/**
 * The tone of one line, read off how the installer starts it:
 * - A step that failed (`[!!]`) and installer failures (`install.sh: `) -> "danger"
 * - A step done (`[ok]`) -> "success"
 * - A step under way (`[..]`) -> "muted"
 * - Anything else -> "default"
 */
export function outputLineTone(line: string): OutputLineTone {
  if (line.startsWith("[!!]") || line.startsWith("install.sh: ")) return "danger";
  if (line.startsWith("[ok]")) return "success";
  if (line.startsWith("[..]")) return "muted";
  return "default";
}

/**
 * How much one focus stop holds: this many lines, and no more characters than
 * this, so that no stop is taller than the dialog — a line of 500 characters
 * wraps to several rows. The window scrolls only by moving focus
 * (`docs/architecture/qam-panel.md`, "Two widths"), so a part of several
 * hundred lines is walked one stop at a time.
 */
const LINES_PER_STOP = 12;
const CHARS_PER_STOP = 1200;

/** lines cut into the text of one focus stop each, within both of the caps above. */
export function outputStops(lines: string[]): string[] {
  const stops: string[] = [];
  let stop = "";
  let held = 0;
  for (const line of lines) {
    if (held === LINES_PER_STOP || (held > 0 && stop.length + line.length >= CHARS_PER_STOP)) {
      stops.push(stop);
      held = 0;
    }
    stop = held++ > 0 ? `${stop}\n${line}` : line;
  }
  if (held > 0) stops.push(stop);
  return stops;
}

export type UpdateOutputViewState =
  | { status: "reading"; title: string; message: string }
  | {
      status: "success";
      title: string;
      installer: UpdateOutputSection;
      newVersion: UpdateOutputSection | null;
      newVersionHeading: string;
    }
  | { status: "missing"; title: string; message: string }
  | { status: "gone"; title: string; message: string }
  | { status: "unread"; title: string; message: string };

/**
 * Resolves the structured view state from an UpdateOutput response or loading state.
 */
export function resolveUpdateOutputView(
  output: UpdateOutput | null | undefined,
  attemptedVersion: string,
): UpdateOutputViewState {
  if (output === undefined) {
    return { status: "reading", title: UPDATE_OUTPUT_TITLE, message: OUTPUT_READING };
  }
  if (output?.success && output.missing === null) {
    const title = `${UPDATE_OUTPUT_TITLE} — ${clockTime(output.ran_at)}`;
    return {
      status: "success",
      title,
      installer: output.installer,
      newVersion: output.new_version,
      newVersionHeading: `${attemptedVersion}, when it tried to start`,
    };
  }
  if (output?.success) {
    return {
      status: "missing",
      title: UPDATE_OUTPUT_TITLE,
      message: OUTPUT_MISSING[output.missing] ?? OUTPUT_UNREAD,
    };
  }
  if (output?.reason === "not_found") {
    return { status: "gone", title: UPDATE_OUTPUT_TITLE, message: OUTPUT_GONE };
  }
  return { status: "unread", title: UPDATE_OUTPUT_TITLE, message: OUTPUT_UNREAD };
}

/** Whether a read is currently in flight: process-wide. */
let inFlight = false;

export function isUpdateOutputReading(): boolean {
  return inFlight;
}

/**
 * Initiates a single-flight read for the installer's output.
 * If a read is already in flight, returns null.
 */
export async function readUpdateOutputOnce(rolledBackAt: string | null): Promise<UpdateOutput | null> {
  if (inFlight) return null;
  inFlight = true;
  try {
    return await getUpdateOutput(rolledBackAt);
  } catch (e) {
    logError(`Failed to read the installer's output: ${e}`);
    return null;
  } finally {
    inFlight = false;
  }
}

export function resetUpdateOutputReadingForTests(): void {
  inFlight = false;
}
