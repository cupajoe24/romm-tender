/**
 * The Sync page's right column: everything that is not the preview or the run.
 *
 * Options (the persisted Skip-preview intent and Force Full Sync), Steam's
 * memory now and what the last run did to it, and the recorded runs. 270 px, so
 * a run row gets one line of description and long lists are counted rather than
 * listed. What each part says, and the state Force Full Sync is in, are
 * `utils/syncPageWording.ts`'s and `utils/syncPageView.ts`'s.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Sync.
 */

import type { FC, ReactNode } from "react";
import { ConfirmModal, DialogButton, Focusable, ToggleField, showModal } from "@decky/ui";
import type { SyncRunRecord } from "../../types";
import { formatGb, formatSignedGb } from "../../utils/sessionBudget";
import { forceFullSyncBlocked, forceFullSyncNote, runHistoryNotice } from "../../utils/syncPageView";
import {
  FORCE_FULL_SYNC_CONFIRM,
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
} from "../../utils/syncPageWording";
import type { SyncPageState } from "../../utils/useSyncPage";
import { memoryLevelColor } from "../SessionBudgetBanner";
import { AMBER, GREEN, MUTED, Muted, RED, SECONDARY_FONT, SectionTitle } from "../layout/pane";

/** How a run ended, in one word and one colour. `running` is the one in flight;
 *  the five terminals a run reaches exactly once are the rest. */
const RUN_STATUS_COLOR: Record<SyncRunRecord["status"], string | undefined> = {
  running: undefined,
  completed: GREEN,
  paused: AMBER,
  cancelled: MUTED,
  interrupted: AMBER,
  errored: RED,
};

/** A label/value row in the controls column, and a focus stop — the column
 *  scrolls only by moving focus, so a row nothing can focus is a row nothing can
 *  scroll past. */
const ControlRow: FC<{
  label: string;
  value: ReactNode;
  subline?: string | undefined;
  testId?: string | undefined;
}> = ({ label, value, subline, testId }) => (
  <Focusable onActivate={() => {}} data-testid={testId} style={{ padding: "4px 16px" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
      <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ flex: "0 0 auto", fontSize: SECONDARY_FONT, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
    {subline !== undefined && (
      <div
        title={subline}
        style={{
          fontSize: SECONDARY_FONT,
          color: MUTED,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {subline}
      </div>
    )}
  </Focusable>
);

export const SyncControls: FC<{ state: SyncPageState }> = ({ state }) => (
  <>
    <OptionsSection state={state} />
    <MemorySection state={state} />
    <RunsSection state={state} />
  </>
);

const OptionsSection: FC<{ state: SyncPageState }> = ({ state }) => (
  <>
    <SectionTitle title={OPTIONS_HEADING} />
    <div style={{ padding: "0 16px" }}>
      {/* Live during a run: the setting is read by the next press of the start
          button, so flipping it while a run is in flight changes nothing about
          that run. */}
      <ToggleField
        label={SKIP_PREVIEW_LABEL}
        description={SKIP_PREVIEW_DESCRIPTION}
        checked={state.skipPreview}
        bottomSeparator="none"
        onChange={state.setSkipPreview}
      />
    </div>
    <div style={{ padding: "6px 16px 0" }}>
      {/* Rendered and disabled rather than hidden: Steam's focus lands on it
          either way. */}
      <DialogButton
        style={{ width: "100%", minWidth: 0, padding: "6px 10px", fontSize: "13px", color: RED }}
        disabled={forceFullSyncBlocked(state)}
        onClick={() =>
          showModal(
            <ConfirmModal
              strTitle={FORCE_FULL_SYNC_CONFIRM.title}
              strDescription={FORCE_FULL_SYNC_CONFIRM.description}
              strOKButtonText={FORCE_FULL_SYNC_CONFIRM.confirm}
              strCancelButtonText={FORCE_FULL_SYNC_CONFIRM.cancel}
              onOK={state.forceFullSync}
            />,
          )
        }
      >
        {FORCE_FULL_SYNC_LABEL}
      </DialogButton>
    </div>
    <Muted>{forceFullSyncNote(state)}</Muted>
    {state.optionsStatus !== null && <Muted>{state.optionsStatus}</Muted>}
  </>
);

const MemorySection: FC<{ state: SyncPageState }> = ({ state }) => {
  const budget = state.budget;
  return (
    <>
      <SectionTitle title={MEMORY_HEADING} />
      <ControlRow
        label={MEMORY_NOW_LABEL}
        testId="memory-now"
        value={
          budget?.rss_kb == null ? (
            <span style={{ color: MUTED }}>{MEMORY_UNAVAILABLE}</span>
          ) : (
            <span style={{ color: memoryLevelColor(budget.rss_kb, budget.warn_kb, budget.ceiling_kb) }}>
              {formatGb(budget.rss_kb)}
            </span>
          )
        }
      />
      <ControlRow
        label={MEMORY_LAST_RUN_LABEL}
        testId="memory-last-run"
        value={
          budget?.memory_delta_kb == null ? (
            <span style={{ color: MUTED }}>{MEMORY_NOT_RECORDED}</span>
          ) : (
            <span style={{ color: MUTED }}>{formatSignedGb(budget.memory_delta_kb)}</span>
          )
        }
      />
    </>
  );
};

const RunsSection: FC<{ state: SyncPageState }> = ({ state }) => {
  const notice = runHistoryNotice(state);
  return (
    <>
      <SectionTitle title={RUNS_HEADING} />
      {notice !== null && <Muted>{notice}</Muted>}
      {state.runs.map((run) => (
        <ControlRow
          key={run.id}
          testId={`run-${run.id}`}
          label={formatRunStart(run.started_at)}
          value={<span style={{ color: RUN_STATUS_COLOR[run.status] }}>{run.status}</span>}
          subline={runHistorySubline(run)}
        />
      ))}
    </>
  );
};
