import { FC, ReactNode, useEffect, useReducer } from "react";
import { PanelSectionRow, ButtonItem, Field, ProgressBar } from "@decky/ui";
import { AMBER, AMBER_WASH, GREEN, MUTED, SELECTION_ACCENT } from "../layout/pane";
import {
  INSTALL_STATE_UNREAD,
  SHOW_OUTPUT,
  STEP_MARKS,
  STEP_TONES,
  WAITING_FOR,
  buttonLabel,
  installButtonShown,
  installStateUnread,
  installSteps,
  namesStatusUnread,
  pausedDownloadsHint,
  shownBlock,
  waitReasonLines,
  type BlockNote,
  type InstallTone,
} from "../../utils/updateInstallView";
import type { RolledBackUpdate } from "../../utils/updateOutcomeStore";
import { cardFrame } from "../UpdateCard";
import { showUpdateOutput } from "./UpdateOutputModal";
import type { UpdateInstall } from "../../utils/useUpdateInstall";

export { installButtonShown, installStateUnread, SHOW_OUTPUT };

/** Each step tone's colour, here and on the fallback page. */
export const STEP_COLORS: Record<InstallTone, string> = {
  success: GREEN,
  accent: SELECTION_ACCENT,
  muted: MUTED,
  warning: AMBER,
};

const SMALL = { fontSize: "12px", color: MUTED, paddingTop: "6px" } as const;

/** A block's note as the section and the fallback page draw it: a warning in amber. */
export function renderNote(note: string | BlockNote | null | undefined): ReactNode {
  if (!note) return null;
  if (typeof note === "string") return note;
  return <span style={note.tone === "warning" ? { color: AMBER } : undefined}>{note.text}</span>;
}

/**
 * The install under Settings › Updates: the button, what it waits for, and one
 * block for what is happening — an attempt's progress, or what failed. Which
 * row carries what, and which rows can leave while they hold focus, is
 * `docs/architecture/qam-panel.md`, Settings. Where there is no button, the
 * section says the state could not be read on its Available row instead.
 */
export const UpdateInstallRows: FC<{ install: UpdateInstall; record: RolledBackUpdate | null; installed: string }> = ({
  install,
  record,
  installed,
}) => {
  const showButton = installButtonShown(install);
  const earlier = installed || "the earlier version";
  const block = shownBlock(install, record, earlier);
  const output = block?.output;
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!install.underWay) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [install.underWay]);
  const pausedHint = pausedDownloadsHint(install.pausedDownloads);
  const waiting = !install.underWay && install.waitReasons.length > 0;
  const waitLines = install.waitReasons.flatMap(waitReasonLines);
  // A sentence never follows "Waiting for:" on the header's own line.
  const inlineWait = waitLines.length === 1 && !install.waitReasons.some(namesStatusUnread) ? waitLines[0] : null;
  const unread = installStateUnread(install);

  const description = (
    <>
      {waiting && (
        <div data-testid="updates-waiting">
          {inlineWait !== null ? (
            <>
              {`${WAITING_FOR} `}
              <span data-testid="updates-wait-reason">{inlineWait}</span>
            </>
          ) : (
            <>
              <div>{WAITING_FOR}</div>
              {waitLines.map((line) => (
                <div key={line} data-testid="updates-wait-reason">
                  {line}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {pausedHint && <div data-testid="updates-paused-hint">{pausedHint}</div>}
      {install.refusal && <div data-testid="updates-install-refusal">{install.refusal}</div>}
      {unread && <div data-testid="updates-install-unread">{INSTALL_STATE_UNREAD}</div>}
    </>
  );
  const hasDescription = waiting || pausedHint !== "" || install.refusal !== "" || unread;

  return (
    <>
      {showButton && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={install.install}
            disabled={
              install.pressing || install.underWay || install.waitReasons.length > 0 || install.version === null
            }
            {...(hasDescription ? { description } : {})}
          >
            {buttonLabel(install)}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {block && (
        <PanelSectionRow>
          {/* One field for every state of the block, so the focus stop stays
              put while its content changes under it. */}
          <Field focusable={true} childrenLayout="below" childrenContainerWidth="max">
            <div style={block.failed ? cardFrame(AMBER, AMBER_WASH) : undefined}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", paddingBottom: "6px" }}>
                <span
                  data-testid="updates-caption"
                  style={block.failed ? { fontWeight: "bold", color: AMBER } : undefined}
                >
                  {block.caption}
                </span>
                <span data-testid="updates-elapsed" style={{ color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                  {block.aside}
                </span>
              </div>
              {block.percent !== undefined && (
                <ProgressBar
                  indeterminate={block.percent === null}
                  {...(block.percent !== null ? { nProgress: block.percent } : {})}
                />
              )}
              {block.at && (
                <div
                  style={{ fontSize: "12px", paddingTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}
                >
                  {installSteps(block.at, block.failed).map(({ id, label, status }) => (
                    <span key={id} data-testid={`updates-step-${id}`} data-status={status}>
                      <span style={{ color: STEP_COLORS[STEP_TONES[status]] }}>{STEP_MARKS[status]}</span> {label}
                    </span>
                  ))}
                </div>
              )}
              {block.note && (
                <div data-testid="updates-note" style={SMALL}>
                  {renderNote(block.note)}
                </div>
              )}
            </div>
          </Field>
        </PanelSectionRow>
      )}
      {output && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => showUpdateOutput(output.rolledBackAt, output.version)}>
            {SHOW_OUTPUT}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </>
  );
};
