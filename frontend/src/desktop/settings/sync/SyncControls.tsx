/**
 * Everything on the desktop's Sync tab that is not the preview or the run: the
 * persisted Skip-preview intent and Force Full Sync, Steam's memory, and the
 * recorded runs. What each says, and the state Force Full Sync is in, are
 * `utils/syncPageWording.ts`'s and `utils/syncPageView.ts`'s.
 */

import type { FC } from "react";
import { DialogButton, Field, ToggleField } from "@decky/ui";
import type { SyncRunRecord } from "../../../types";
import { formatGb, formatSignedGb, memoryLevel, type MemoryLevel } from "../../../utils/sessionBudget";
import { forceFullSyncBlocked, forceFullSyncNote, runHistoryNotice } from "../../../utils/syncPageView";
import {
  FORCE_FULL_SYNC_LABEL,
  MEMORY_HEADING,
  MEMORY_LAST_RUN_LABEL,
  MEMORY_NOT_RECORDED,
  MEMORY_NOW_LABEL,
  MEMORY_UNAVAILABLE,
  OPTIONS_HEADING,
  RUNS_HEADING,
  SKIP_PREVIEW_DESCRIPTION,
  SKIP_PREVIEW_LABEL,
  formatRunStart,
  runHistorySubline,
} from "../../../utils/syncPageWording";
import type { SyncPageState } from "../../../utils/useSyncPage";
import { SectionHeading } from "../SectionHeading";
import {
  AMBER,
  BUTTON_STYLE,
  GREEN,
  MUTED,
  MUTED_TEXT_STYLE,
  RED,
  SECTION_STYLE,
  SUBLINE_STYLE,
  TABLE_STYLE,
  TD_STYLE,
} from "../settingsStyles";

const MEMORY_COLOR: Record<MemoryLevel, string> = { full: RED, high: AMBER, fine: GREEN };

/** How a run ended, in one colour; `running` is the one in flight. */
const RUN_STATUS_COLOR: Record<SyncRunRecord["status"], string | undefined> = {
  running: undefined,
  completed: GREEN,
  paused: AMBER,
  cancelled: MUTED,
  interrupted: AMBER,
  errored: RED,
};

/**
 * Skip preview, live during a run: the setting is read by the next press of the
 * start button, so flipping it while a run is in flight changes nothing about
 * that run. Force Full Sync asks first (*onForceFullSync*), and is drawn disabled
 * rather than hidden with the line under it saying why.
 */
export const OptionsSection: FC<{ state: SyncPageState; onForceFullSync: () => void }> = ({
  state,
  onForceFullSync,
}) => (
  <section style={SECTION_STYLE}>
    <SectionHeading title={OPTIONS_HEADING} />
    <ToggleField
      label={SKIP_PREVIEW_LABEL}
      description={SKIP_PREVIEW_DESCRIPTION}
      checked={state.skipPreview}
      onChange={state.setSkipPreview}
    />
    <DialogButton
      style={{ ...BUTTON_STYLE, marginTop: "10px", color: RED }}
      disabled={forceFullSyncBlocked(state)}
      onClick={onForceFullSync}
    >
      {FORCE_FULL_SYNC_LABEL}
    </DialogButton>
    <div style={MUTED_TEXT_STYLE}>{forceFullSyncNote(state)}</div>
    {state.optionsStatus !== null && <div style={MUTED_TEXT_STYLE}>{state.optionsStatus}</div>}
  </section>
);

export const MemorySection: FC<{ state: SyncPageState }> = ({ state }) => {
  const budget = state.budget;
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={MEMORY_HEADING} />
      <Field label={MEMORY_NOW_LABEL}>
        <span data-testid="memory-now">
          {budget?.rss_kb == null ? (
            <span style={{ color: MUTED }}>{MEMORY_UNAVAILABLE}</span>
          ) : (
            <span style={{ color: MEMORY_COLOR[memoryLevel(budget.rss_kb, budget.warn_kb, budget.ceiling_kb)] }}>
              {formatGb(budget.rss_kb)}
            </span>
          )}
        </span>
      </Field>
      <Field label={MEMORY_LAST_RUN_LABEL}>
        <span data-testid="memory-last-run" style={{ color: MUTED }}>
          {budget?.memory_delta_kb == null ? MEMORY_NOT_RECORDED : formatSignedGb(budget.memory_delta_kb)}
        </span>
      </Field>
    </section>
  );
};

export const RunsSection: FC<{ state: SyncPageState }> = ({ state }) => {
  const notice = runHistoryNotice(state);
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={RUNS_HEADING} />
      {notice !== null && <div style={MUTED_TEXT_STYLE}>{notice}</div>}
      {state.runs.length > 0 && (
        <table style={TABLE_STYLE} data-testid="run-history">
          <tbody>
            {state.runs.map((run) => (
              <tr key={run.id} data-testid={`run-${run.id}`}>
                <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>{formatRunStart(run.started_at)}</td>
                <td style={{ ...TD_STYLE, color: RUN_STATUS_COLOR[run.status] }}>{run.status}</td>
                <td style={TD_STYLE}>
                  <div style={{ ...SUBLINE_STYLE, marginTop: 0 }}>{runHistorySubline(run)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
