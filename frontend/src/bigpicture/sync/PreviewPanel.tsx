/**
 * The Sync page's left column while a preview is pending: the three buttons that
 * end the preview, and under them what the run would change, as a table.
 *
 * The buttons come first — "here is what you can do, and here is why" — because
 * the table is as long as the reader's library is wide and every row of it is a
 * focus stop. A region scrolls only by moving focus, so a button row under a
 * table of fifteen platforms is fifteen stick presses from the top of the
 * column, which is where a reader opening the page starts. Entry focus lands on
 * Apply Sync, or on Refresh where Apply is dead.
 *
 * The expired notice travels with the button row, above it, and is the only line
 * that does: it explains the header's amber "expired" and names the button to
 * press instead, so it is a caption on the buttons rather than on the evidence.
 * Under the table it would have put a dead Apply a whole library ahead of its
 * own reason. Everything else under there — the scope and estimate, the hint,
 * the pause advisory — describes the run the table is about and stays with it.
 *
 * What the table holds is `utils/syncPageView.ts`'s `previewBody`, and every word
 * on it `utils/syncPageWording.ts`'s.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Sync.
 */

import type { FC, ReactNode } from "react";
import { DialogButton } from "@decky/ui";
import type { SyncPreview } from "../../types";
import { previewHasChanges } from "../../utils/previewState";
import { previewApplySeconds } from "../../utils/syncEstimate";
import { isFullResync, previewBody, type PreviewRowModel } from "../../utils/syncPageView";
import {
  APPLY_SYNC_LABEL,
  CANCEL_PREVIEW_LABEL,
  FULL_RESYNC_LINE,
  MISSING_BREAKDOWN_LINE,
  NO_COUNT,
  PAUSE_ADVISORY,
  PREVIEW_COLUMN_NAMES,
  PREVIEW_EXPIRED_LINE,
  PREVIEW_HEADING,
  REFRESH_LABEL,
  previewDeadlineNote,
  previewEstimateLine,
  previewHint,
} from "../../utils/syncPageWording";
import type { SyncPageState } from "../../utils/useSyncPage";
import { AMBER, ButtonRow, FLAT_BUTTON, MUTED, Muted, SECONDARY_FONT, SectionTitle } from "../layout/pane";
import { PaneRow, TableHeader, TableRow, TABLE_LINE } from "./paneTable";

/** Platform, then the three counts. The numeric columns are sized for the
 *  widest heading rather than the widest number — "Removed" is 52px at the
 *  Deck's scale and a six-figure count is narrower — so what is left goes to the
 *  name, which is the column with something to say. */
const PREVIEW_COLUMNS = "minmax(0, 1fr) 52px 62px 68px";

/** The deadline clause on the section title, amber once it has passed.
 *  Conditional spreads because the frame's props are optional under
 *  `exactOptionalPropertyTypes`. */
function deadlineNote(expired: boolean, secondsLeft: number | null): { note?: string; noteColor?: string } {
  const note = previewDeadlineNote(expired, secondsLeft);
  if (note === null) return {};
  return expired ? { note, noteColor: AMBER } : { note };
}

export const PreviewPanel: FC<{ state: SyncPageState; preview: SyncPreview }> = ({ state, preview }) => {
  const summary = preview.summary;
  const body = previewBody(preview);
  const hasChanges = previewHasChanges(preview);
  const applySeconds = previewApplySeconds(summary);
  const expired = state.previewExpired;

  return (
    <>
      {/* The deadline rides the section title rather than taking a line of its
          own: on the Deck the column has about four rows to spend and the table
          is what they are for. */}
      <SectionTitle title={PREVIEW_HEADING} {...deadlineNote(expired, state.previewSecondsLeft)} />
      {isFullResync(summary) && <Muted>{FULL_RESYNC_LINE}</Muted>}
      {expired && <Muted>{PREVIEW_EXPIRED_LINE}</Muted>}
      <ButtonRow padding="4px 16px 8px">
        <DialogButton style={FLAT_BUTTON} disabled={state.busy || expired || !hasChanges} onClick={state.applyPreview}>
          {APPLY_SYNC_LABEL}
        </DialogButton>
        <DialogButton style={FLAT_BUTTON} disabled={state.busy} onClick={state.refreshPreview}>
          {REFRESH_LABEL}
        </DialogButton>
        <DialogButton style={FLAT_BUTTON} disabled={state.busy} onClick={state.cancelPreview}>
          {CANCEL_PREVIEW_LABEL}
        </DialogButton>
      </ButtonRow>
      {body.kind === "table" ? (
        <>
          <TableHeader columns={PREVIEW_COLUMNS} cells={[...PREVIEW_COLUMN_NAMES]} numericFrom={1} />
          {body.platformRows === null ? (
            <Muted>{MISSING_BREAKDOWN_LINE}</Muted>
          ) : (
            body.platformRows.map((row) => <PreviewRow key={row.key} row={row} />)
          )}
          {body.collectionRows.map((row) => (
            <PreviewRow key={row.key} row={row} />
          ))}
          <PreviewRow row={body.total} total />
          {body.beyondTheColumns !== null && <Muted>{body.beyondTheColumns}</Muted>}
        </>
      ) : (
        <Muted>{body.sentence}</Muted>
      )}
      {hasChanges && (
        <PaneRow>
          <span style={{ fontSize: SECONDARY_FONT, color: MUTED }}>{previewEstimateLine(summary, applySeconds)}</span>
        </PaneRow>
      )}
      {hasChanges && <Muted>{previewHint(applySeconds)}</Muted>}
      {preview.pause_likely === true && (
        <div
          data-testid="budget-advisory"
          style={{
            fontSize: SECONDARY_FONT,
            color: "#7fbcff",
            borderLeft: "3px solid rgba(61, 157, 246, 0.6)",
            padding: "2px 8px",
            margin: "2px 16px 6px",
            lineHeight: 1.4,
          }}
        >
          {PAUSE_ADVISORY}
        </div>
      )}
      {state.status !== null && <Muted>{state.status}</Muted>}
    </>
  );
};

const PreviewRow: FC<{ row: PreviewRowModel; total?: boolean }> = ({ row, total }) => {
  const { name, inlineNote, subline, counts } = row;
  // The cell clips; the title is what the reader gets back, so it carries the
  // whole of what the cell would have said.
  const label: ReactNode = (
    <span title={inlineNote ? `${name} · ${inlineNote}` : name} style={{ fontWeight: total ? 600 : 400 }}>
      {name}
      {inlineNote && <span style={{ color: MUTED }}>{` · ${inlineNote}`}</span>}
    </span>
  );
  const countCells: ReactNode[] = counts
    ? [
        <CountCell key="new" value={counts[0]} bold={total ?? false} />,
        <CountCell key="changed" value={counts[1]} bold={total ?? false} />,
        <CountCell key="removed" value={counts[2]} bold={total ?? false} />,
      ]
    : ["new", "changed", "removed"].map((column) => (
        <span key={column} style={{ color: MUTED }}>
          {NO_COUNT}
        </span>
      ));
  return (
    <TableRow
      columns={PREVIEW_COLUMNS}
      style={total ? { borderTop: TABLE_LINE, marginTop: "2px", paddingTop: "5px" } : undefined}
      cells={[label, ...countCells]}
      numericFrom={1}
      subline={subline}
    />
  );
};

const CountCell: FC<{ value: number; bold: boolean }> = ({ value, bold }) => (
  <span style={{ color: value === 0 ? MUTED : undefined, fontWeight: bold ? 600 : 400 }}>{value}</span>
);
