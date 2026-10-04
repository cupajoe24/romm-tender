/**
 * The three things the desktop's Sync tab leads with — exactly one at a time,
 * decided by the tab: the run in flight, the pending preview, or the button that
 * starts one. A run in flight owns the tab, as it owns the QAM page.
 *
 * What each says, and what its tables hold, are `utils/syncPageWording.ts`'s
 * and `utils/syncPageView.ts`'s; the presses are `useSyncPage`'s.
 */

import type { FC, ReactNode } from "react";
import { DialogButton, ProgressBar } from "@decky/ui";
import type { SyncPreview } from "../../../types";
import { previewHasChanges } from "../../../utils/previewState";
import type { RunUnit } from "../../../utils/runUnitsStore";
import { previewApplySeconds } from "../../../utils/syncEstimate";
import { isFullResync, previewBody, runUnitRow, type PreviewRowModel } from "../../../utils/syncPageView";
import {
  APPLY_SYNC_LABEL,
  CANCELLING_LABEL,
  CANCEL_PREVIEW_LABEL,
  CANCEL_SYNC_LABEL,
  COLLECTION_UNIT_NOTE,
  FULL_RESYNC_LINE,
  MISSING_BREAKDOWN_LINE,
  NO_COUNT,
  PAUSE_ADVISORY,
  PREVIEW_COLUMN_NAMES,
  PREVIEW_EXPIRED_LINE,
  PREVIEW_HEADING,
  REFRESH_LABEL,
  RUN_COLUMN_NAMES,
  RUN_HEADING,
  idleLine,
  noUnitsLine,
  previewDeadlineNote,
  previewEstimateLine,
  previewHint,
  runProgressNote,
} from "../../../utils/syncPageWording";
import type { SyncPageState } from "../../../utils/useSyncPage";
import { SectionHeading } from "../SectionHeading";
import {
  AMBER,
  BLUE,
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  GREEN,
  INLINE_BAR_TRACK_STYLE,
  MUTED,
  MUTED_TEXT_STYLE,
  NUMERIC_STYLE,
  SECTION_STYLE,
  SUBLINE_STYLE,
  TABLE_STYLE,
  TD_STYLE,
  TH_STYLE,
  TOTAL_CELL_STYLE,
  noticeCardStyle,
} from "../settingsStyles";

const Muted: FC<{ children: ReactNode }> = ({ children }) => <div style={MUTED_TEXT_STYLE}>{children}</div>;

/** Nothing pending and nothing running: one line saying so, the button that
 *  changes it, and what that button's name leaves unsaid. */
export const IdleBody: FC<{ state: SyncPageState }> = ({ state }) => (
  <section style={SECTION_STYLE}>
    <SectionHeading title={PREVIEW_HEADING} />
    <Muted>{idleLine(state.skipPreview, state.startLabel)}</Muted>
    <div style={BUTTON_ROW_STYLE}>
      <DialogButton style={BUTTON_STYLE} disabled={state.busy} onClick={state.startPreview}>
        {state.startLabel}
      </DialogButton>
    </div>
    {state.resume.scopeText !== null && <Muted>{state.resume.scopeText}</Muted>}
    {state.status !== null && <Muted>{state.status}</Muted>}
  </section>
);

/** A pending preview: the three answers to it first, then what it would change. */
export const PreviewBody: FC<{ state: SyncPageState; preview: SyncPreview }> = ({ state, preview }) => {
  const summary = preview.summary;
  const body = previewBody(preview);
  const hasChanges = previewHasChanges(preview);
  const applySeconds = previewApplySeconds(summary);
  const expired = state.previewExpired;
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading
        title={PREVIEW_HEADING}
        note={previewDeadlineNote(expired, state.previewSecondsLeft)}
        noteColor={expired ? AMBER : undefined}
      />
      {isFullResync(summary) && <Muted>{FULL_RESYNC_LINE}</Muted>}
      {expired && <Muted>{PREVIEW_EXPIRED_LINE}</Muted>}
      <div style={BUTTON_ROW_STYLE}>
        <DialogButton style={BUTTON_STYLE} disabled={state.busy || expired || !hasChanges} onClick={state.applyPreview}>
          {APPLY_SYNC_LABEL}
        </DialogButton>
        <DialogButton style={BUTTON_STYLE} disabled={state.busy} onClick={state.refreshPreview}>
          {REFRESH_LABEL}
        </DialogButton>
        <DialogButton style={BUTTON_STYLE} disabled={state.busy} onClick={state.cancelPreview}>
          {CANCEL_PREVIEW_LABEL}
        </DialogButton>
      </div>
      {body.kind === "table" ? (
        <>
          <table style={TABLE_STYLE} data-testid="preview-table">
            <thead>
              <tr>
                {PREVIEW_COLUMN_NAMES.map((name, index) => (
                  <th key={name} style={index === 0 ? TH_STYLE : { ...TH_STYLE, ...NUMERIC_STYLE }}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.platformRows === null ? (
                <tr>
                  <td colSpan={4} style={{ ...TD_STYLE, color: MUTED }}>
                    {MISSING_BREAKDOWN_LINE}
                  </td>
                </tr>
              ) : (
                body.platformRows.map((row) => <PreviewRow key={row.key} row={row} />)
              )}
              {body.collectionRows.map((row) => (
                <PreviewRow key={row.key} row={row} />
              ))}
              <PreviewRow row={body.total} total />
            </tbody>
          </table>
          {body.beyondTheColumns !== null && <Muted>{body.beyondTheColumns}</Muted>}
        </>
      ) : (
        <Muted>{body.sentence}</Muted>
      )}
      {hasChanges && <Muted>{previewEstimateLine(summary, applySeconds)}</Muted>}
      {hasChanges && <Muted>{previewHint(applySeconds)}</Muted>}
      {preview.pause_likely === true && (
        <div data-testid="budget-advisory" style={noticeCardStyle(BLUE)}>
          {PAUSE_ADVISORY}
        </div>
      )}
      {state.status !== null && <Muted>{state.status}</Muted>}
    </section>
  );
};

const COUNT_COLUMNS = ["new", "updated", "removed"] as const;

const PreviewRow: FC<{ row: PreviewRowModel; total?: boolean }> = ({ row, total = false }) => {
  const cell = total ? { ...TD_STYLE, ...TOTAL_CELL_STYLE } : TD_STYLE;
  return (
    <tr>
      <td style={cell}>
        {row.name}
        {row.inlineNote !== undefined && <span style={{ color: MUTED }}>{` · ${row.inlineNote}`}</span>}
        {row.subline !== undefined && <div style={SUBLINE_STYLE}>{row.subline}</div>}
      </td>
      {COUNT_COLUMNS.map((column, index) => {
        const value = row.counts?.[index];
        return (
          <td
            key={column}
            style={{ ...cell, ...NUMERIC_STYLE, color: value === undefined || value === 0 ? MUTED : undefined }}
          >
            {value ?? NO_COUNT}
          </td>
        );
      })}
    </tr>
  );
};
/** The run in flight: the whole run as one bar, Cancel Sync under it, and every
 *  unit of the plan with its own state. */
export const RunBody: FC<{ state: SyncPageState }> = ({ state }) => {
  const run = state.run;
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={RUN_HEADING} note={runProgressNote(run)} />
      <div data-testid="run-stage" style={{ ...MUTED_TEXT_STYLE, marginBottom: "4px" }}>
        {run.stageLabel}
      </div>
      <ProgressBar
        indeterminate={run.coarseFraction === undefined}
        {...(run.coarseFraction !== undefined ? { nProgress: run.coarseFraction } : {})}
      />
      <div style={BUTTON_ROW_STYLE}>
        <DialogButton style={BUTTON_STYLE} disabled={state.cancelling} onClick={state.cancelRun}>
          {state.cancelling ? CANCELLING_LABEL : CANCEL_SYNC_LABEL}
        </DialogButton>
      </div>
      {state.units.length === 0 ? (
        <Muted>{noUnitsLine(run)}</Muted>
      ) : (
        <table style={TABLE_STYLE} data-testid="run-units">
          <thead>
            <tr>
              {RUN_COLUMN_NAMES.map((name) => (
                <th key={name} style={TH_STYLE}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.units.map((unit) => (
              <RunUnitRow key={`${unit.type}:${unit.id}`} unit={unit} state={state} />
            ))}
          </tbody>
        </table>
      )}
      {state.status !== null && <Muted>{state.status}</Muted>}
    </section>
  );
};

const RunUnitRow: FC<{ unit: RunUnit; state: SyncPageState }> = ({ unit, state }) => {
  const row = runUnitRow(unit, state.run.stage);
  const statusColor = row.state === "done" ? GREEN : row.state === "waiting" ? MUTED : undefined;
  return (
    <tr data-testid={`run-unit-${unit.type}-${unit.id}`}>
      <td style={TD_STYLE}>
        {unit.name}
        {unit.type === "collection" && <span style={{ color: MUTED }}>{` · ${COLLECTION_UNIT_NOTE}`}</span>}
      </td>
      <td style={{ ...TD_STYLE, color: statusColor }}>
        {row.status}
        {row.state === "running" && <InlineBar fraction={state.run.withinUnitFraction} />}
      </td>
      <td style={{ ...TD_STYLE, color: row.state === "waiting" ? MUTED : undefined }}>{row.result}</td>
    </tr>
  );
};

const InlineBar: FC<{ fraction: number }> = ({ fraction }) => (
  <div data-testid="unit-bar" style={INLINE_BAR_TRACK_STYLE}>
    <div
      style={{
        height: "100%",
        borderRadius: "2px",
        width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
        background: BLUE,
      }}
    />
  </div>
);
