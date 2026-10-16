/**
 * The desktop dialog for "Show what the installer said": the installer's run
 * for one failed update and, after a rollback, what the version it tried printed
 * while it tried to start, read back from the journal by the backend.
 *
 * Drawn in the desktop settings window's own document, styled with Steam's
 * desktop modal theme and monospace log display.
 */

import { useEffect, useState, type CSSProperties, type FC } from "react";
import { logError, type UpdateOutput } from "../../../api/backend";
import {
  OUTPUT_READING,
  outputLineTone,
  readUpdateOutputOnce,
  resolveUpdateOutputView,
  type OutputLineTone,
} from "../../../utils/updateOutputView";
import {
  DIALOG_ACTIONS_STYLE,
  DIALOG_MUTED_STYLE,
  DIALOG_TEXT_STYLE,
  DesktopDialog,
  dialogButtonStyle,
} from "../../gameview/dialogs/DesktopDialog";

export interface DesktopUpdateOutputDialogProps {
  readonly rolledBackAt: string | null;
  readonly version: string;
  readonly onClose: () => void;
}

const TONE_COLORS: Record<OutputLineTone, string> = {
  danger: "#e5a00d",
  success: "#59bf40",
  muted: "#8f98a0",
  default: "#c7d5e0",
};

const LOG_BOX_STYLE: CSSProperties = {
  maxHeight: "360px",
  overflowY: "auto",
  fontFamily: "monospace",
  fontSize: "12px",
  backgroundColor: "rgba(0, 0, 0, 0.45)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "4px",
  padding: "10px 12px",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  margin: "8px 0 16px 0",
};

const SECTION_HEADING_STYLE: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#ffffff",
  margin: "12px 0 4px 0",
};

function earlierLine(count: number): string {
  return count === 1 ? "1 earlier line is not shown." : `${count} earlier lines are not shown.`;
}

export const DesktopUpdateOutputDialog: FC<DesktopUpdateOutputDialogProps> = ({ rolledBackAt, version, onClose }) => {
  const [output, setOutput] = useState<UpdateOutput | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    readUpdateOutputOnce(rolledBackAt)
      .then((res) => {
        if (active) setOutput(res);
      })
      .catch((err) => {
        logError(`Failed to read installer output: ${err}`);
        if (active) setOutput(null);
      });
    return () => {
      active = false;
    };
  }, [rolledBackAt]);

  const view = resolveUpdateOutputView(output, version);

  return (
    <DesktopDialog titleId="tender-desktop-update-output-dialog-title" title={view.title} onDismiss={onClose}>
      <div data-testid="desktop-update-output-dialog">
        {view.status === "reading" && (
          <div data-testid="output-reading" style={{ ...DIALOG_TEXT_STYLE, padding: "16px 0" }}>
            {OUTPUT_READING}
          </div>
        )}

        {view.status !== "reading" && view.status !== "success" && (
          <div data-testid="output-message" style={{ ...DIALOG_TEXT_STYLE, padding: "16px 0" }}>
            {view.message}
          </div>
        )}

        {view.status === "success" && (
          <div>
            {view.newVersion && <div style={SECTION_HEADING_STYLE}>The installer</div>}
            {view.installer.earlier > 0 && <div style={DIALOG_MUTED_STYLE}>{earlierLine(view.installer.earlier)}</div>}
            <div data-testid="output-installer" style={LOG_BOX_STYLE}>
              {view.installer.lines.map((line, idx) => (
                <div
                  key={idx}
                  data-testid="output-line"
                  style={{ color: TONE_COLORS[outputLineTone(line)], lineHeight: "1.4" }}
                >
                  {line}
                </div>
              ))}
            </div>

            {view.newVersion && (
              <div>
                <div style={SECTION_HEADING_STYLE}>{view.newVersionHeading}</div>
                {view.newVersion.earlier > 0 && (
                  <div style={DIALOG_MUTED_STYLE}>{earlierLine(view.newVersion.earlier)}</div>
                )}
                <div data-testid="output-new-version" style={LOG_BOX_STYLE}>
                  {view.newVersion.lines.map((line, idx) => (
                    <div
                      key={idx}
                      data-testid="output-line"
                      style={{ color: TONE_COLORS[outputLineTone(line)], lineHeight: "1.4" }}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={DIALOG_ACTIONS_STYLE}>
          <button type="button" data-testid="output-close-btn" style={dialogButtonStyle("primary")} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </DesktopDialog>
  );
};
