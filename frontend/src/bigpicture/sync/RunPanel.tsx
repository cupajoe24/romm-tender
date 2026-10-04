/**
 * The Sync page's left column while a run is in flight: the whole run as one
 * bar, and under it every unit of the plan with its own state.
 *
 * Two levels from facts the frontend already holds. The bar, the stage caption,
 * the step counter and the estimate are `useSyncRunView`'s — the same
 * derivation Main's slot takes its bar and counter from, so the two surfaces
 * cannot disagree about the run they are both showing. The caption, the
 * fine-detail line and the estimate are read here and nowhere else: Main leaves
 * them to the page with room for them. The rows are `runUnitsStore`'s, seeded
 * from the plan and advanced by the run's own frames, which is what lets a page
 * opened mid-run show the units already worked through rather than only the
 * current one.
 *
 * Cancel Sync sits directly under the bar, above the list. That is the ORDER of
 * the column and not a compromise: the bar, the stage and the button that stops
 * the run are one thing, and the unit table under them is evidence rather than a
 * control. It is also the only place a controller can reach it from — a region
 * scrolls by moving focus and the stick walks the rows one at a time, so a
 * button under a sixteen-unit plan is sixteen presses away, which is what a
 * device round measured before it moved up here. Being first is what makes it
 * where focus lands when this body takes the column, too: the page's swap rule
 * picks the first stop holding no stop of its own, and every unit row below is a
 * stop as well.
 *
 * The unit list scrolls on its own, inside what is left of the column under the
 * bar and the button: a plan of fourteen platforms and three collections is
 * taller than the Deck's column, and without a region of its own the running
 * unit walks out of sight below the fold. The running row is scrolled to the
 * middle of that region as the run reaches it, because nothing moves focus
 * during a run and Steam scrolls a region only by moving focus.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Sync.
 */

import { useEffect, useRef, type CSSProperties, type FC, type ReactNode } from "react";
import { DialogButton, ProgressBar } from "@decky/ui";
import type { RunUnit } from "../../utils/runUnitsStore";
import { offsetWithinScroller } from "../../utils/scrollHelpers";
import { runUnitRow } from "../../utils/syncPageView";
import {
  CANCELLING_LABEL,
  CANCEL_SYNC_LABEL,
  COLLECTION_UNIT_NOTE,
  RUN_COLUMN_NAMES,
  RUN_HEADING,
  noUnitsLine,
  runProgressNote,
} from "../../utils/syncPageWording";
import { ButtonRow, FLAT_BUTTON, GREEN, MUTED, Muted, SECONDARY_FONT, SectionTitle } from "../layout/pane";
import { FOCUS_RING_REACH, ScrollRegion } from "../layout/ScrollRegion";
import { InlineBar, PaneRow, TableHeader, TableRow } from "./paneTable";
import type { SyncPageState } from "../../utils/useSyncPage";

/** Unit, what is happening to it, what it produced. */
const RUN_COLUMNS = "minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)";

/** Marks the unit list's own scroller, so the running row can be scrolled to
 *  from the ref on the pane around it. */
const UNIT_REGION_TESTID = "run-units";

/** The pane fills the column and hands what is left over to the unit list —
 *  which is what gives that list a height to scroll inside. `minHeight: 0` on
 *  both, or a flex child's floor is its content and the list grows instead. */
const RUN_PANE: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 };

/** `height: auto` overrides the region's own `100%`: inside a column flex that
 *  would measure against the pane rather than against what is left of it.
 *
 *  The side margins stand this region in its column's room for the focus ring,
 *  so the unit table starts where the section title over it does rather than a
 *  second room further in (`docs/architecture/qam-panel.md` § Room for the
 *  focus ring). */
const UNIT_REGION: CSSProperties = {
  flex: "1 1 auto",
  height: "auto",
  minHeight: 0,
  marginLeft: -FOCUS_RING_REACH,
  marginRight: -FOCUS_RING_REACH,
};

/**
 * Put *row* in the middle of *region*, without scrolling past either end.
 *
 * A run walks its own rows, so nothing moves focus and Steam scrolls nothing —
 * the list has to be moved here or the running unit walks off the bottom. The
 * clamp is what keeps the first and last rows where they belong: centring row 1
 * of 16 would ask for a negative offset, and a region whose content already fits
 * has no offset to give, so it is left alone.
 */
function centreRowInRegion(region: HTMLElement, row: HTMLElement): void {
  const furthest = region.scrollHeight - region.clientHeight;
  if (furthest <= 0) return;
  const centred = offsetWithinScroller(row, region) + row.getBoundingClientRect().height / 2 - region.clientHeight / 2;
  region.scrollTo({ top: Math.max(0, Math.min(furthest, centred)), behavior: "smooth" });
}

export const RunPanel: FC<{ state: SyncPageState }> = ({ state }) => {
  const run = state.run;
  const note = runProgressNote(run);
  const pane = useRef<HTMLDivElement | null>(null);
  const running = state.units.find((unit) => unit.state === "running");
  const runningTestId = running ? unitTestId(running) : null;
  useEffect(() => {
    const root = pane.current;
    if (root === null || runningTestId === null) return;
    const region = root.querySelector<HTMLElement>(`[data-testid="${UNIT_REGION_TESTID}"]`);
    const row = root.querySelector<HTMLElement>(`[data-testid="${runningTestId}"]`);
    if (region !== null && row !== null) centreRowInRegion(region, row);
  }, [runningTestId]);
  return (
    <div ref={pane} style={RUN_PANE}>
      <SectionTitle title={RUN_HEADING} {...(note !== null ? { note } : {})} />
      <PaneRow>
        <div style={{ fontSize: SECONDARY_FONT, color: MUTED, paddingBottom: "4px" }} data-testid="run-stage">
          {run.stageLabel}
        </div>
        <ProgressBar
          indeterminate={run.coarseFraction === undefined}
          {...(run.coarseFraction !== undefined ? { nProgress: run.coarseFraction } : {})}
        />
      </PaneRow>
      <ButtonRow padding="6px 16px 4px">
        <DialogButton style={FLAT_BUTTON} disabled={state.cancelling} onClick={state.cancelRun}>
          {state.cancelling ? CANCELLING_LABEL : CANCEL_SYNC_LABEL}
        </DialogButton>
      </ButtonRow>
      {state.units.length === 0 ? (
        <Muted>{noUnitsLine(run)}</Muted>
      ) : (
        <ScrollRegion testId={UNIT_REGION_TESTID} style={UNIT_REGION}>
          <TableHeader columns={RUN_COLUMNS} cells={[...RUN_COLUMN_NAMES]} numericFrom={2} />
          {state.units.map((unit) => (
            <RunUnitRow key={`${unit.type}:${unit.id}`} unit={unit} state={state} />
          ))}
        </ScrollRegion>
      )}
      {state.status !== null && <Muted>{state.status}</Muted>}
    </div>
  );
};

/** One unit's row, by the id its `data-testid` carries — the handle the pane
 *  scrolls the running row by, and the one the tests read it by. */
function unitTestId(unit: RunUnit): string {
  return `run-unit-${unit.type}-${unit.id}`;
}

const RunUnitRow: FC<{ unit: RunUnit; state: SyncPageState }> = ({ unit, state }) => {
  const row = runUnitRow(unit, state.run.stage);
  // The cell clips; the title is what the reader gets back.
  const nameCell: ReactNode = (
    <span title={unit.type === "collection" ? `${unit.name} · ${COLLECTION_UNIT_NOTE}` : unit.name}>
      {unit.name}
      {unit.type === "collection" && <span style={{ color: MUTED }}>{` · ${COLLECTION_UNIT_NOTE}`}</span>}
    </span>
  );

  let status: ReactNode;
  if (row.state === "done") {
    status = <span style={{ color: GREEN }}>{row.status}</span>;
  } else if (row.state === "running") {
    status = (
      <span>
        {row.status}
        <InlineBar fraction={state.run.withinUnitFraction} />
      </span>
    );
  } else {
    status = <span style={{ color: MUTED }}>{row.status}</span>;
  }

  return (
    <TableRow
      columns={RUN_COLUMNS}
      numericFrom={2}
      testId={unitTestId(unit)}
      cells={[
        nameCell,
        status,
        <span key="result" style={{ color: row.state === "waiting" ? MUTED : undefined }}>
          {row.result}
        </span>,
      ]}
    />
  );
};
