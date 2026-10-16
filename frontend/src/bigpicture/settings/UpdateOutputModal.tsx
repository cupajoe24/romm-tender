/**
 * The window "Show what the installer said" opens: the installer's run for one
 * failed update and, after a rollback, what the version it tried printed while
 * it tried to start, both read back from the journal by the backend.
 *
 * Which run is shown, why a rollback has two parts and the lines a part is cut
 * to are `docs/architecture/backend-architecture.md`, "UpdateOutputService
 * notes"; the backend picks the run and hides the admission token before any
 * line reaches the panel.
 */

import { FC, Fragment, ReactNode, useEffect, useState } from "react";
import { DialogButton, Focusable, ModalRoot, showModal } from "@decky/ui";
import { getUpdateOutput, logError, type UpdateOutput, type UpdateOutputSection } from "../../api/backend";
import { detach } from "../../utils/detach";
import { clockTime } from "../../utils/updateInstallView";
import {
  OUTPUT_GONE,
  OUTPUT_MISSING,
  OUTPUT_READING,
  OUTPUT_UNREAD,
  UPDATE_OUTPUT_TITLE,
  outputLineTone,
  outputStops,
} from "../../utils/updateOutputView";
import { AMBER, GREEN, MUTED } from "../layout/pane";

export { OUTPUT_MISSING, OUTPUT_READING, OUTPUT_GONE, OUTPUT_UNREAD, outputStops };

const TITLE = UPDATE_OUTPUT_TITLE;

/**
 * What makes text a focus stop: `focusableIfEmpty`, which `FocusableProps`
 * does not declare, as the cleanup's details region does
 * (`RemovedGamesCleanup.tsx`, `DETAILS_REGION_STOP`).
 */
const TEXT_STOP: { focusableIfEmpty: boolean } = { focusableIfEmpty: true };

const MONO = { fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

/** Each of *texts* beside where it starts once they are joined by newlines — a key no two of them share. */
function atOffsets(texts: string[]): { at: number; text: string }[] {
  let at = 0;
  return texts.map((text) => {
    const entry = { at, text };
    at += text.length + 1;
    return entry;
  });
}

/**
 * The colour of one line, mapped from the line's tone token to Big Picture's palette.
 */
export function outputLineColour(line: string): string | undefined {
  const tone = outputLineTone(line);
  if (tone === "danger") return AMBER;
  if (tone === "success") return GREEN;
  if (tone === "muted") return MUTED;
  return undefined;
}

/** One stop's text, each of its lines in its colour. */
const StopLines: FC<{ text: string }> = ({ text }) => (
  <>
    {atOffsets(text.split("\n")).map(({ at, text: line }) => (
      <Fragment key={at}>
        {at > 0 && "\n"}
        <span style={{ color: outputLineColour(line) }}>{line}</span>
      </Fragment>
    ))}
  </>
);

const Part: FC<{ heading: string; section: UpdateOutputSection }> = ({ heading, section: { lines, earlier } }) => (
  <div style={{ marginTop: "12px" }}>
    <b>{heading}</b>
    {earlier > 0 && (
      <div style={{ color: MUTED, fontSize: "12px" }}>
        {earlier === 1 ? "1 earlier line is" : `${earlier} earlier lines are`} not shown.
      </div>
    )}
    {atOffsets(outputStops(lines)).map(({ at, text }) => (
      <Focusable key={at} {...TEXT_STOP} style={MONO}>
        <StopLines text={text} />
      </Focusable>
    ))}
  </div>
);

interface UpdateOutputModalProps {
  /** The backend's answer on its way; `null` where the call did not arrive. Never rejects. */
  read: Promise<UpdateOutput | null>;
  /** The version the update tried to install, which names the rollback's second part. */
  attemptedVersion: string;
  closeModal?: () => void;
}

export const UpdateOutputModal: FC<UpdateOutputModalProps> = ({ read, attemptedVersion, closeModal }) => {
  const [output, setOutput] = useState<UpdateOutput | null>();
  useEffect(() => detach(read.then(setOutput)), [read]);
  let title = TITLE;
  let body: ReactNode = output === undefined ? OUTPUT_READING : OUTPUT_UNREAD;
  if (output?.success && output.missing === null) {
    title += ` — ${clockTime(output.ran_at)}`;
    body = (
      <>
        <Part heading="The installer" section={output.installer} />
        {output.new_version && (
          <Part heading={`${attemptedVersion}, when it tried to start`} section={output.new_version} />
        )}
      </>
    );
  } else if (output?.success) {
    body = OUTPUT_MISSING[output.missing] ?? OUTPUT_UNREAD;
  } else if (output?.reason === "not_found") {
    body = OUTPUT_GONE;
  }
  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ maxWidth: "720px", maxHeight: "76vh", overflowY: "auto", padding: "16px" }}>
        <div style={{ fontSize: "16px", fontWeight: "bold" }}>{title}</div>
        {typeof body === "string" ? <Focusable {...TEXT_STOP}>{body}</Focusable> : body}
        <DialogButton style={{ marginTop: "16px" }} onClick={() => closeModal?.()}>
          Close
        </DialogButton>
      </div>
    </ModalRoot>
  );
};

/** Whether a press's answer is still on its way: a press meanwhile opens no second window. */
let reading = false;

/**
 * Open the window at once, saying it is reading, and fill it with the
 * backend's answer for one failure — the record stamped *rolledBackAt*, or
 * this backend's latest attempt with `null`. A call that fails is logged, and
 * the window says so.
 */
export function showUpdateOutput(rolledBackAt: string | null, attemptedVersion: string): void {
  if (reading) return;
  reading = true;
  const read = getUpdateOutput(rolledBackAt)
    .catch((e: unknown) => {
      logError(`Failed to read the installer's output: ${e}`);
      return null;
    })
    .finally(() => {
      reading = false;
    });
  showModal(<UpdateOutputModal read={read} attemptedVersion={attemptedVersion} />);
}
