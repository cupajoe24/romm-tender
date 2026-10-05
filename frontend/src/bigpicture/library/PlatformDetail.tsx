/**
 * Everything about one platform, in the Platforms tab's right-hand pane: what
 * it holds, which core launches it, the BIOS files that core wants, and the two
 * ways to take it back out of Steam. What each part says and the decisions
 * behind it are `utils/platformsPageWording.ts`'s and
 * `utils/platformsPageView.ts`'s; this file draws them for the QAM.
 *
 * The pane scrolls by moving focus, so every row a reader must reach is a focus
 * stop — the BIOS table's rows included, which is why a row with nothing to
 * press still carries an activate handler.
 *
 * The sync toggle is deliberately absent: it lives in the list row, where the
 * focus already is.
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Library.
 */

import { useState, type FC, type ReactNode } from "react";
import { ConfirmModal, DialogButton, Focusable, showContextMenu, showModal, Spinner } from "@decky/ui";
import { FaMicrochip } from "react-icons/fa";
import type { FirmwarePlatformExt } from "../../types";
import { biosColorForLevel } from "../../utils/biosColor";
import { emulatorClause } from "../../utils/emulatorClause";
import { buildEmulatorMenu } from "../../utils/emulatorMenu";
import { platformSystemClause } from "../../utils/emulatorSourceWording";
import { getEventTarget } from "../../utils/events";
import {
  biosAbsence,
  biosLegend,
  biosRowAction,
  biosRowText,
  biosSectionView,
  contentsCell,
  coreOffer,
  declaredFolder,
  diskMark,
  downloadState,
  libraryMark,
  type CoreOffer,
  type FirmwareRow,
  type MarkTone,
} from "../../utils/platformsPageView";
import {
  BIOS_ABSENCE_LINE,
  BIOS_HEADING,
  BIOS_STALE,
  BIOS_TABLE_HEADINGS,
  BY_HAND_LINE,
  busyPlatformName,
  CORE_BUTTON_TITLE,
  DOWNLOAD_ALL_LABEL,
  DOWNLOAD_LABEL,
  FAILED_LABEL,
  REMOVING_DURING_SYNC,
  SAVE_COUNT_FAILED,
  SHORTCUT_COUNTS_FAILED,
  deleteBiosConfirm,
  deleteBiosLabel,
  deleteRowConfirm,
  deleteRowLabel,
  deleteSavesConfirm,
  deleteSavesLabel,
  downloadRequiredLabel,
  removalProgressLine,
  removeShortcutsConfirm,
  removeShortcutsLabel,
  unansweredLine,
  type ConfirmWords,
} from "../../utils/platformsPageWording";
import { useSyncRunning } from "../../utils/syncRunning";
import type { DetailStatus, PlatformRow, PlatformsPageState, StatusScope } from "../../utils/usePlatformsPage";
import {
  AMBER,
  BusyElsewhere,
  ButtonRow,
  FLAT_BUTTON,
  GREEN,
  GroupStatus,
  MUTED,
  Muted,
  NOTE_FONT,
  PALE_GREEN,
  PANE_GUTTER,
  PANE_TABLE_REGISTER,
  PaneTableHeader,
  PaneTableRow,
  RED,
  ROW_BUTTON,
  SECONDARY_FONT,
  SectionTitle,
  SubHeading,
  VIOLET,
  type ScopedStatus,
  type TableRegister,
} from "../layout/pane";

/** The page's status line as the pane primitives read it: on this page the key
 *  a line is bound to is the platform slug. The scope type travels with it, so
 *  the literal each `GroupStatus` names is checked against the page's groups. */
const scopedStatus = (status: DetailStatus | null): ScopedStatus<StatusScope> | null =>
  status && { key: status.slug, scope: status.scope, text: status.text };

const MARK_COLOR: Record<MarkTone, string> = {
  good: GREEN,
  fine: PALE_GREEN,
  bad: RED,
  quiet: MUTED,
  unsure: AMBER,
  library: VIOLET,
};

/**
 * The core picker's button in the header line — the game page's icon button, at
 * this line's scale.
 *
 * The chrome is written out rather than reusing `.romm-gear-btn`, for a reason
 * that needs no claim about which document the class reaches: that class is
 * 36×36 (`styleInjector.ts`), which is the game page's play row, and this line
 * is 28px tall. What IS shared is what the user asked to be shared — the icon
 * and its two colours.
 */
const CORE_BUTTON = {
  alignSelf: "center",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  minWidth: "28px",
  height: "28px",
  padding: 0,
  borderRadius: "4px",
  flexShrink: 0,
} as const;

// File, On disk, Contents, and the row's own button. Every column but the first
// is sized for the widest thing it can hold, measured on the device at the
// Deck's scale: the `On disk` heading is 38.7px and two marks are ~34px; the
// widest image count ("12 images") is 76.8px against a 46.1px heading, and the
// resolver's longer words for a file's check wrap inside the column rather than
// being cut; the Download button's label is ~55px.
// What that leaves goes to the file name, which is the column with something to
// say. None of them is conditional — a column that appears and disappears per
// platform is worse than a narrow one.
const TABLE_COLUMNS = "1fr 48px 84px 92px";

// A file's row and the column names over the rows are set at the 12px of the
// section heading, two pixels above the NOTE_FONT lines under each name: on the
// Deck one pixel apart is no difference at all, and column names set like the
// notes read as notes rather than as a table head.
const BIOS_TABLE_FONT = "12px";
const BIOS_TABLE_REGISTER: TableRegister = {
  ...PANE_TABLE_REGISTER,
  // Half the pane's row padding: each row already carries its lines under the name.
  rowPadding: `2px ${PANE_GUTTER}`,
  rowFont: BIOS_TABLE_FONT,
  rowLineHeight: 1.25,
  headerFont: BIOS_TABLE_FONT,
};

const BiosTableHeader: FC = () => (
  <PaneTableHeader
    columns={TABLE_COLUMNS}
    cells={[...BIOS_TABLE_HEADINGS, ""]}
    register={BIOS_TABLE_REGISTER}
    testId="bios-table-header"
  />
);

/**
 * The lines under a row, full width, because the alternative is a 48px cell
 * wrapping one sentence across three lines — the cost the marks were introduced
 * to stop paying. A note here is also rare in the ordinary case: over the
 * `.info` corpus the rows that carry one are the handful RetroDECK supplies
 * itself and PS2's folder row. That is a statement about a healthy install, not
 * about the vocabulary — `biosFileNote`'s caveat wording appears wherever a
 * destination cannot be read, which no corpus can predict.
 *
 * The images sit under the row rather than in the Contents cell because the
 * cell is 84px and one of their labels is not; the cell counts them instead.
 */
const BiosRowLines: FC<{ lines: string[] }> = ({ lines }) =>
  lines.length === 0 ? null : (
    <div style={{ display: "flex", flexDirection: "column", marginLeft: "18px" }}>
      {lines.map((line) => (
        <div key={line} style={{ fontSize: NOTE_FONT, lineHeight: 1.2, color: MUTED, whiteSpace: "pre-wrap" }}>
          {line}
        </div>
      ))}
    </div>
  );

/** What the marks in `On disk` mean, under the table that uses them — the
 *  entries `biosLegend` answers, one per line. */
const BiosLegend: FC<{ files: FirmwareRow[] }> = ({ files }) => {
  const shown = biosLegend(files);
  if (shown.length === 0) return null;
  return (
    <div
      data-testid="bios-legend"
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "2px 16px 6px",
        fontSize: SECONDARY_FONT,
        lineHeight: 1.3,
      }}
    >
      {shown.map((entry) => (
        <span key={entry.title} style={{ color: MUTED }}>
          <span style={{ color: MARK_COLOR[entry.tone] }}>{entry.glyph}</span> {entry.title}
        </span>
      ))}
    </div>
  );
};

const BiosFileRow: FC<{ file: FirmwareRow; action: ReactNode }> = ({ file, action }) => {
  const mark = diskMark(file);
  const library = libraryMark(file);
  const { description, lines } = biosRowText(file);
  const folder = declaredFolder(file);
  return (
    // The row is a focus stop only while it has nothing to press: an action cell
    // holds a button that is already a stop, and a second one on the wrapper
    // would put a dead step in front of every one of them. `action` is therefore
    // a NODE that may be null and never a component element — an element is
    // always truthy, which is how this branch went dead once while the comment
    // on it went on explaining it.
    <PaneTableRow
      columns={TABLE_COLUMNS}
      register={BIOS_TABLE_REGISTER}
      testId="bios-file-row"
      focusStop={!action}
      cells={[
        {
          // With the folder in front of it what gets cut is the NAME rather
          // than the description that used to sit here —
          // `scummvm/extra/hadesch_translations.dat` does not fit 202px in any
          // arrangement. The title is the mouse's way back to it; a reader on
          // the gamepad has the description on the next line.
          content: (
            <>
              <span style={NAME_LINE}>
                {folder && <span style={{ color: MUTED }}>{folder}</span>}
                {file.file_name}
              </span>
              <span data-testid="bios-need" style={NEED_LINE}>
                {needWords(file)}
              </span>
            </>
          ),
          title: file.declared_path ?? file.file_name,
        },
        {
          // Glyphs rather than a run of text: nothing to ellipsise, and the
          // pair is laid out rather than flowed.
          content: (
            <>
              <span data-testid="disk-mark" style={{ color: MARK_COLOR[mark.tone] }} title={mark.title}>
                {mark.glyph}
              </span>
              {library && (
                <span data-testid="library-mark" style={{ color: MARK_COLOR[library.tone] }} title={library.title}>
                  {library.glyph}
                </span>
              )}
            </>
          ),
          style: { display: "flex", gap: "4px", fontSize: "12px", whiteSpace: "nowrap" },
          clip: false,
        },
        // Wrapped, never cut: these words are the explanation of the mark
        // beside them, and a controller has no way to the cell's title.
        { content: contents, clip: false, style: CONTENTS_CELL },
        // The button draws its focus ring outside its own box (the injected
        // sheet's outline), so this cell must not hide its overflow.
        { content: action, clip: false },
      ]}
    >
      {/* What the file is for, when known: ScummVM's extra engines, the DC / NAOMI
          regional BIOSes, the PS1 PAL image. The line sits under the table
          row, full width, because a third line in the first cell would wrap
          under the Deck's font scale. */}
      {description && (
        <div style={{ fontSize: NOTE_FONT, color: MUTED, marginLeft: "18px", marginTop: "2px" }}>{description}</div>
      )}
      <BiosRowLines lines={lines} />
    </PaneTableRow>
  );
};

/**
 * The header's second line: the facts about the platform, smaller and muted.
 *
 * Each part keeps itself on one line and carries the separator in front of it,
 * so the line wraps only between parts — at the Deck's width a free-flowing
 * line broke "RetroDECK system snes" after its first word — and never cuts one.
 */
const HeaderFacts: FC<{ parts: { text: string; color?: string }[] }> = ({ parts }) => (
  <div
    data-testid="platform-facts"
    style={{
      display: "flex",
      flexWrap: "wrap",
      columnGap: "4px",
      padding: "2px 16px 0",
      fontSize: NOTE_FONT,
      color: MUTED,
    }}
  >
    {parts.map((part, index) => (
      <span key={part.text} style={{ whiteSpace: "nowrap", color: part.color }}>
        {index === 0 ? part.text : `· ${part.text}`}
      </span>
    ))}
  </div>
);

/**
 * The line under the header when there is no core to pick, and the place a
 * refused switch is reported.
 *
 * There is no heading and no button: the button moved into the header line the
 * platform is already named on, which is where the game page keeps its own. The
 * save-compatibility warning moved with it — into the picker, where
 * `buildEmulatorMenu` has always rendered it, so a copy here was the same
 * sentence on the page that opens the menu carrying it.
 */
const CoreNotice: FC<{ row: PlatformRow; state: PlatformsPageState; offer: CoreOffer }> = ({ row, state, offer }) => (
  <>
    {offer.kind === "blocked" && offer.notice !== undefined && <Muted>{offer.notice}</Muted>}
    <GroupStatus status={scopedStatus(state.status)} forKey={row.slug} scope="core" />
  </>
);

/**
 * The colour the header's core clause and its chip both take.
 */
function coreClauseColour(gamesCannotStart: boolean, isOverride: boolean): string {
  if (gamesCannotStart) return RED;
  return isOverride ? AMBER : MUTED;
}

/** The label a download button carries right now — its own word unless its run
 *  is speaking; *disabled* is that button's own state. */
function downloadLabel(
  row: PlatformRow,
  state: PlatformsPageState,
  id: string,
  label: string,
  size: number,
  disabled: boolean,
): ReactNode {
  const showing = downloadState(row, state, id);
  if (showing === "spinner") return <Spinner width={size} height={size} />;
  return showing === "failed" ? <span style={{ color: RED }}>{FAILED_LABEL}</span> : label;
}

const confirm = (words: ConfirmWords, onOK: () => void) =>
  showModal(
    <ConfirmModal
      strTitle={words.title}
      strDescription={words.description}
      strOKButtonText={words.confirm}
      strCancelButtonText={words.cancel}
      onOK={onOK}
    />,
  );

/** A BIOS row's one action as a button — or nothing, which is a `null` the row
 *  needs in order to wrap itself in a `Focusable`. */
function rowAction(
  row: PlatformRow,
  state: PlatformsPageState,
  file: FirmwareRow,
  fetchable: ReadonlySet<string>,
): ReactNode | null {
  const action = biosRowAction(file, fetchable, state.serverOffline);
  if (action === null) return null;
  const busy = state.busySlug !== null;
  if (action.kind === "download") {
    return (
      <DialogButton
        style={ROW_BUTTON}
        disabled={disabled}
        onClick={() => {
          if (busy) return;
          focus.mark(key);
          state.downloadOne(row.slug, file.file_name, emulator);
        }}
      >
        {downloadLabel(row, state, file.file_name, DOWNLOAD_LABEL, 11)}
      </DialogButton>
    );
  }
  const onConfirm = () =>
    confirm(deleteRowConfirm(file.file_name, action.folder, action.count), () => {
      if (action.folder) state.deleteBiosFolder(row.slug, file.local_path);
      else state.deleteBiosFile(row.slug, file.file_name);
    });
  return (
    <DialogButton style={ROW_BUTTON} disabled={busy} onClick={onConfirm}>
      <span style={{ color: RED }}>{deleteRowLabel(action.folder, action.count)}</span>
    </DialogButton>
  );
}

// What `useBiosFocus` knows each focus target of the BIOS part by.
const tableKey = (file: string) => `table:${file}`;
const libraryKey = (file: string) => `library:${file}`;
const BULK_REQUIRED = "bulk:required";
const BULK_ALL = "bulk:all";
const BULK_DELETE = "bulk:delete";

const BiosSection: FC<{ row: PlatformRow; state: PlatformsPageState; firmware: FirmwarePlatformExt }> = ({
  row,
  state,
  firmware,
}) => {
  const files = firmware.files;
  const view = biosSectionView(firmware, state.serverOffline);
  return (
    <div ref={attachRoot}>
      {/* The ratio is stated once, here, and takes the same mapping the list's
          dot takes — the header carried a second copy of it until the device
          pass, and its width was what wrapped that line three times. Two places
          state a platform's BIOS state and they now agree by construction. */}
      <SectionTitle
        title={BIOS_HEADING}
        note={view.status}
        noteColor={biosColorForLevel(firmware.bios_level ?? null)}
      />
      <Muted fontSize={NOTE_FONT}>{view.sentence}</Muted>
      {view.nothingEstablished && <Muted fontSize={NOTE_FONT}>{BY_HAND_LINE}</Muted>}
      {files.length > 0 && <BiosTableHeader />}
      {files.map((file) => (
        <BiosFileRow key={file.file_name} file={file} action={rowAction(row, state, file, view.fetchable)} />
      ))}
      {files.length > 0 && <BiosLegend files={files} />}
      {view.unanswered > 0 && <Muted fontSize={NOTE_FONT}>{unansweredLine(view.unanswered)}</Muted>}
      {/* One row of buttons rather than three stacked full-width ones. Each
          `ButtonItem` is a `Field` row around a button and costs the pane a row
          of its own.

          Every button is always rendered and disables when there is nothing to
          do, the ruling the user gave for the Remove group and for the same
          reason: a button that vanishes is a state the reader has to work out,
          and on PS2 all of them vanished at once. A disabled `DialogButton` is
          still a focus stop, so the row stays walkable. The one exception is
          "Download required" where no emulator has an entry: there is no
          requirement it could fetch, rather than nothing left to do. */}
      {requiredLabel !== null && (
        <ButtonRow padding="2px 16px 6px">
          <div style={{ display: "contents" }} ref={slot(BULK_REQUIRED)}>
            <DialogButton
              style={FLAT_BUTTON}
              disabled={bulkDisabled(BULK_REQUIRED, showRequired)}
              onClick={pressBulk(BULK_REQUIRED, () => state.downloadRequired(row.slug, shownEmulator))}
            >
              {downloadLabel(
                row,
                state,
                "required",
                `${requiredLabel} (${requiredMissing})`,
                12,
                bulkDisabled(BULK_REQUIRED, showRequired),
              )}
            </DialogButton>
          </div>
        </ButtonRow>
      )}
      {/* The platform-wide pair, apart from the shown emulator's:
          "Download all" fetches every file the library holds for the platform,
          and the delete takes every download of Tender's own for it — its
          number is the backend's `deletable_count`, the records still on disk,
          which is exactly what the delete unlinks. Delete is local-only (no
          server needed). */}
      <SubHeading title={`For all of ${row.name}`} />
      <ButtonRow padding="2px 16px 6px">
        <DialogButton
          style={FLAT_BUTTON}
          disabled={!view.canDownloadRequired || state.busySlug !== null}
          onClick={() => state.downloadRequired(row.slug)}
        >
          {downloadLabel(row, state, "required", downloadRequiredLabel(view.requiredMissing), 12)}
        </DialogButton>
        <DialogButton
          style={FLAT_BUTTON}
          disabled={!view.canDownloadAll || state.busySlug !== null}
          onClick={() => state.downloadAll(row.slug)}
        >
          {downloadLabel(row, state, "all", DOWNLOAD_ALL_LABEL, 12)}
        </DialogButton>
        <DialogButton
          style={FLAT_BUTTON}
          disabled={view.deletable === 0 || state.busySlug !== null}
          onClick={() => confirm(deleteBiosConfirm(row.name), () => state.deleteBios(row.slug))}
        >
          <span style={{ color: RED }}>{deleteBiosLabel(view.deletable)}</span>
        </DialogButton>
      </ButtonRow>
      <GroupStatus status={scopedStatus(state.status)} forKey={row.slug} scope="bios" />
      {libraryRows.length > 0 && (
        <>
          <SubHeading title="In your RomM library, asked for by no emulator here" />
          <BiosTableHeader />
          {libraryRows.map((file) => (
            <div key={file.file_name} ref={slot(libraryKey(file.file_name))}>
              <BiosFileRow
                file={file}
                action={rowAction(row, state, file, libraryFetchable, null, focus, libraryKey(file.file_name))}
                emulator={firmware.active_core_label ?? null}
              />
            </div>
          ))}
        </>
      )}
      {shownRows.length + libraryRows.length > 0 && <BiosLegend files={[...shownRows, ...libraryRows]} />}
    </div>
  );
};

/**
 * Taking a platform back out of Steam, and taking its save files off the disk.
 *
 * Neither button is hidden when its own count is zero. Hiding the group on the
 * shortcut count alone strands a platform whose shortcuts were removed but whose
 * saves remain: those saves are then unreachable, and this is the only page that
 * offers them.
 *
 * The saves count is its own read (`count_platform_saves`) rather than a number
 * taken from somewhere cheaper, because nowhere else has it — the delete finds
 * its files through the platform's installed ROMs and counts only what it
 * removed, afterwards.
 */
const RemoveSection: FC<{ row: PlatformRow; state: PlatformsPageState }> = ({ row, state }) => {
  const syncRunning = useSyncRunning();
  const saveCount = state.saveCountFor(row.slug);
  return (
    <>
      {/* One row, and no REMOVE heading over it: both buttons say what they
          remove and are drawn in red, so a title above them names nothing the
          buttons do not — and it would cost the pane a row. */}
      <ButtonRow padding="6px 16px 4px">
        <DialogButton
          style={FLAT_BUTTON}
          disabled={state.busySlug !== null || syncRunning || row.shortcutCount === 0}
          onClick={() => confirm(removeShortcutsConfirm(row), () => state.removeShortcuts(row))}
        >
          <span style={{ color: RED }}>{removeShortcutsLabel(row.shortcutCount)}</span>
        </DialogButton>
        {/* Unread is not zero and is not a failure either, and the button must
            not look like either: while the count is still coming it is disabled
            and spins, which claims nothing. A pressable plain label would invite
            a press over an unknown set; a `0` would state an emptiness nobody
            established. A failed read is the third case and says so below. */}
        <DialogButton
          style={FLAT_BUTTON}
          disabled={state.busySlug !== null || saveCount === undefined || saveCount === 0}
          onClick={() => confirm(deleteSavesConfirm(row.name), () => state.deleteSaves(row))}
        >
          <span style={{ color: RED, display: "inline-flex", alignItems: "center", gap: "6px" }}>
            {saveCount === undefined && <Spinner width={12} height={12} />}
            {deleteSavesLabel(saveCount)}
          </span>
        </DialogButton>
      </ButtonRow>
      {/* With the spinner above, a failed read would be a spinner that never
          stops — so the failure and the spinner land together. */}
      {saveCount === null && <Muted>{SAVE_COUNT_FAILED}</Muted>}
      {/* The hint was a ButtonItem `description`, attached to the one button it
          was about; under a row it has nowhere to hang, so it names that button
          instead (`REMOVING_DURING_SYNC` says why only that one). */}
      {syncRunning && <Muted>{REMOVING_DURING_SYNC}</Muted>}
      <GroupStatus status={scopedStatus(state.status)} forKey={row.slug} scope="remove" />
    </>
  );
};

export const PlatformDetail: FC<{ row: PlatformRow; state: PlatformsPageState }> = ({ row, state }) => {
  const core = state.coreFor(row.slug);
  const firmware = row.firmware;
  const offer = coreOffer(core);
  const activeLabel = core ? core.active_core_label : null;
  const clause = emulatorClause(core ?? null);
  const activeIsDefault = core?.emulators.find((option) => option.label === activeLabel)?.is_default ?? false;
  const coreColor = coreClauseColour(clause?.gamesCannotStart ?? false, activeLabel !== null && !activeIsDefault);
  const coreClauseObj = clause === null ? null : { text: clause.text, color: coreColor };
  const systemClause = core?.platform_system ? platformSystemClause(core.platform_system) : null;
  const absence = biosAbsence(row);

  return (
    <>
      {/* Two header lines rather than a Sync section: the toggle is in the list
          row, so what is left here is what the platform IS — and, since the
          device round, the core picker too: a full-width button under the
          header cost the pane a `Field`-height row and a warning line to say
          what the picker itself says. The name has the first line to itself,
          because sharing it with the facts squeezed a two-word name onto two
          lines over the counts at the Deck's width. */}
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px 0" }}
      >
        <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: "16px", fontWeight: 600, color: "#dcdedf" }}>
          {row.name}
        </span>
        {/* Always rendered, disabled when there is nothing to pick, with the
            reason in the tooltip — the same ruling the Remove group follows.
            A disabled button is still a focus stop, and the wide page's own
            sheet gives it Steam's focus outline, so a reader walking the header
            still lands on it and is told why it is dead. */}
        <DialogButton
          style={CORE_BUTTON}
          title={offer.kind === "pick" ? CORE_BUTTON_TITLE : offer.reason}
          disabled={offer.kind !== "pick" || state.busySlug !== null}
          onClick={(e: MouseEvent) => {
            if (offer.kind !== "pick") return;
            showContextMenu(
              buildEmulatorMenu({
                emulators: offer.core.emulators,
                emulatorDataAvailable: offer.core.emulator_data_available,
                emulatorDataReason: offer.core.emulator_data_reason,
                emulatorSource: offer.core.emulator_source,
                emulatorPlatformSystem: offer.core.platform_system,
                activeLabel: offer.core.active_core_label,
                // Null on purpose: this pane IS the platform level, so marking
                // an entry "(system)" would restate where the reader already is.
                platformCoreLabel: null,
                onPick: (label) => state.changeCore(row.slug, label),
              }),
              getEventTarget(e),
            );
          }}
        >
          <FaMicrochip size={16} color={coreColor} />
        </DialogButton>
      </Focusable>
      {/* Both counts are ROM FILES, which is what makes the pair readable: one
          shortcut serves a whole sibling group and the game's page switches
          versions across it, so a version that did not win the binding is
          still reachable and still belongs on the right. Counting shortcuts
          there instead read as "207 are missing" on a platform where nothing
          was. The Remove button below keeps the shortcut count — that one
          really is about Steam entries. */}
      <HeaderFacts
        parts={[
          ...(coreClauseObj ? [{ text: coreClauseObj.text, color: coreClauseObj.color }] : []),
          { text: `${row.romCount} on RomM` },
          ...(row.reachableCount === null ? [] : [{ text: `${row.reachableCount} in Steam` }]),
          ...(systemClause === null ? [] : [{ text: systemClause }]),
        ]}
      />
      {/* The count is what failed, not the removal: taking the platform's games
          out of Steam needs only the slug. So the line says the number is
          missing and stops there — the buttons below stay live. */}
      {state.shortcutCountsFailed && <Muted>{SHORTCUT_COUNTS_FAILED}</Muted>}
      {state.removalProgress?.slug === row.slug && (
        <Muted>{removalProgressLine(state.removalProgress.removed, state.removalProgress.total)}</Muted>
      )}
      <BusyElsewhere busyKey={state.busySlug} ownKey={row.slug} busyName={busyPlatformName(state)} />
      <CoreNotice row={row} state={state} offer={offer} />
      {row.firmwareStale && <Muted>{BIOS_STALE}</Muted>}
      {firmware ? (
        <BiosSection key={row.slug} row={row} state={state} firmware={firmware} />
      ) : (
        <>
          <SectionTitle title={BIOS_HEADING} />
          {absence !== null && <Muted fontSize={NOTE_FONT}>{BIOS_ABSENCE_LINE[absence]}</Muted>}
        </>
      )}
      <RemoveSection row={row} state={state} />
    </>
  );
};
