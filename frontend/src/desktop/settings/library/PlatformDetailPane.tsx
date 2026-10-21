/**
 * One platform on the desktop's Library tab: what it holds and which core
 * launches it, the BIOS files that core wants, and the two ways to take it back
 * out of Steam. What each part says and may do is `utils/platformsPageView.ts`'s
 * and `utils/platformsPageWording.ts`'s, as on the QAM's pane; only the drawing
 * is the desktop's own, and every confirm is asked through *ask*.
 */

import type { FC, ReactNode } from "react";
import { DialogButton, showContextMenu, Spinner } from "@decky/ui";
import { FaMicrochip } from "react-icons/fa";
import type { FirmwarePlatformExt } from "../../../types";
import { biosColorForLevel } from "../../../utils/biosColor";
import { busyElsewhereLine } from "../../../utils/busyElsewhere";
import { detach } from "../../../utils/detach";
import { buildEmulatorMenu } from "../../../utils/emulatorMenu";
import { getEventTarget } from "../../../utils/events";
import {
  biosAbsence,
  biosLegend,
  biosRowAction,
  biosRowText,
  biosSectionView,
  contentsCell,
  coreClause,
  coreOffer,
  declaredFolder,
  diskMark,
  downloadState,
  libraryMark,
  type CoreTone,
  type FirmwareRow,
  type MarkTone,
} from "../../../utils/platformsPageView";
import {
  BIOS_ABSENCE_LINE,
  BIOS_HEADING,
  BIOS_STALE,
  BIOS_TABLE_HEADINGS,
  BY_HAND_LINE,
  CORE_BUTTON_TITLE,
  DOWNLOAD_ALL_LABEL,
  DOWNLOAD_LABEL,
  FAILED_LABEL,
  REMOVING_DURING_SYNC,
  SAVE_COUNT_FAILED,
  SHORTCUT_COUNTS_FAILED,
  busyPlatformName,
  deleteBiosConfirm,
  deleteBiosLabel,
  deleteRowConfirm,
  deleteRowLabel,
  deleteSavesConfirm,
  deleteSavesLabel,
  downloadRequiredLabel,
  headerCounts,
  removalProgressLine,
  removeShortcutsConfirm,
  removeShortcutsLabel,
  unansweredLine,
  type ConfirmWords,
} from "../../../utils/platformsPageWording";
import { useSyncRunning } from "../../../utils/syncRunning";
import type { PlatformRow, PlatformsPageState, StatusScope } from "../../../utils/usePlatformsPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import {
  AMBER,
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  DETAIL_TITLE_STYLE,
  GREEN,
  MUTED,
  MUTED_TEXT_STYLE,
  PALE_GREEN,
  RED,
  SECTION_STYLE,
  SUBLINE_STYLE,
  TABLE_STYLE,
  TD_STYLE,
  TH_STYLE,
  VIOLET,
} from "../settingsStyles";

const MARK_COLOR: Record<MarkTone, string> = {
  good: GREEN,
  fine: PALE_GREEN,
  bad: RED,
  quiet: MUTED,
  unsure: AMBER,
  library: VIOLET,
};

const CORE_COLOR: Record<CoreTone, string> = { unpinnable: RED, override: AMBER, plain: MUTED };

const ROW_BUTTON_STYLE = { ...BUTTON_STYLE, minWidth: "auto", padding: "4px 10px", fontSize: "12px" };

const CORE_BUTTON_STYLE = {
  width: "32px",
  minWidth: "32px",
  height: "32px",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

interface PaneProps {
  row: PlatformRow;
  state: PlatformsPageState;
  ask: AskDialog;
}

/** Ask *words* in a danger confirm, and run *onYes* on yes. */
function confirmThen(ask: AskDialog, titleId: string, words: ConfirmWords, onYes: () => void): void {
  detach(
    (async () => {
      const yes = await ask(false, (resolve) => (
        <DesktopConfirmDialog
          titleId={titleId}
          title={words.title}
          description={words.description}
          confirmLabel={words.confirm}
          cancelLabel={words.cancel}
          tone="danger"
          onChoice={resolve}
        />
      ));
      if (yes) onYes();
    })(),
  );
}

/** The page's status line, where it belongs to this platform and this group. */
const GroupStatus: FC<{ row: PlatformRow; state: PlatformsPageState; scope: StatusScope }> = ({ row, state, scope }) =>
  state.status?.slug === row.slug && state.status.scope === scope ? (
    <div role="status" data-testid={`status-${scope}`} style={MUTED_TEXT_STYLE}>
      {state.status.text}
    </div>
  ) : null;

/** A download button's label right now — its own words unless its run is speaking. */
function downloadLabel(row: PlatformRow, state: PlatformsPageState, id: string, label: string): ReactNode {
  const showing = downloadState(row, state, id);
  if (showing === "spinner") return <Spinner width={12} height={12} />;
  return showing === "failed" ? <span style={{ color: RED }}>{FAILED_LABEL}</span> : label;
}

const BiosFileRow: FC<PaneProps & { file: FirmwareRow; fetchable: ReadonlySet<string>; emulator: string | null }> = ({
  row,
  state,
  ask,
  file,
  fetchable,
  emulator,
}) => {
  const mark = diskMark(file);
  const library = libraryMark(file);
  const { description, lines } = biosRowText(file);
  const folder = declaredFolder(file);
  const action = biosRowAction(file, fetchable, state.serverOffline);
  const busy = state.busySlug !== null;
  let button: ReactNode = null;
  if (action?.kind === "download") {
    button = (
      <DialogButton
        style={ROW_BUTTON_STYLE}
        disabled={busy}
        onClick={() => state.downloadOne(row.slug, file.file_name, emulator)}
      >
        {downloadLabel(row, state, file.file_name, DOWNLOAD_LABEL)}
      </DialogButton>
    );
  } else if (action?.kind === "delete") {
    button = (
      <DialogButton
        style={ROW_BUTTON_STYLE}
        disabled={busy}
        onClick={() =>
          confirmThen(
            ask,
            "tender-settings-delete-bios-file-title",
            deleteRowConfirm(file.file_name, action.folder, action.count),
            () => {
              if (action.folder) state.deleteBiosFolder(row.slug, file.local_path);
              else state.deleteBiosFile(row.slug, file.file_name);
            },
          )
        }
      >
        <span style={{ color: RED }}>{deleteRowLabel(action.folder, action.count)}</span>
      </DialogButton>
    );
  }
  return (
    <tr data-testid={`bios-row-${file.file_name}`}>
      <td style={{ ...TD_STYLE, wordBreak: "break-all" }} title={file.declared_path ?? file.file_name}>
        {folder && <span style={{ color: MUTED }}>{folder}</span>}
        {file.file_name}
        {description && <div style={SUBLINE_STYLE}>{description}</div>}
        {lines.map((line) => (
          <div key={line} style={{ ...SUBLINE_STYLE, whiteSpace: "pre-wrap" }}>
            {line}
          </div>
        ))}
      </td>
      <td style={{ ...TD_STYLE, whiteSpace: "nowrap", fontSize: "14px" }}>
        <span data-testid="disk-mark" style={{ color: MARK_COLOR[mark.tone] }} title={mark.title}>
          {mark.glyph}
        </span>{" "}
        {library && (
          <span data-testid="library-mark" style={{ color: MARK_COLOR[library.tone] }} title={library.title}>
            {library.glyph}
          </span>
        )}
      </td>
      <td style={{ ...TD_STYLE, color: MUTED }}>{contentsCell(file)}</td>
      <td style={{ ...TD_STYLE, textAlign: "right" }}>{button}</td>
    </tr>
  );
};

const BiosSection: FC<PaneProps & { firmware: FirmwarePlatformExt }> = ({ row, state, ask, firmware }) => {
  const files = firmware.files;
  const view = biosSectionView(firmware, state.serverOffline);
  const legend = biosLegend(files);
  const busy = state.busySlug !== null;
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading
        title={BIOS_HEADING}
        note={view.status}
        noteColor={biosColorForLevel(firmware.bios_level ?? null)}
      />
      <div style={MUTED_TEXT_STYLE}>{view.sentence}</div>
      {view.nothingEstablished && <div style={MUTED_TEXT_STYLE}>{BY_HAND_LINE}</div>}
      {files.length > 0 && (
        <table style={TABLE_STYLE} data-testid="bios-table">
          <thead>
            <tr>
              {BIOS_TABLE_HEADINGS.map((heading) => (
                <th key={heading} style={TH_STYLE}>
                  {heading}
                </th>
              ))}
              <th style={TH_STYLE} aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <BiosFileRow
                key={file.file_name}
                row={row}
                state={state}
                ask={ask}
                file={file}
                fetchable={view.fetchable}
                emulator={firmware.active_core_label ?? null}
              />
            ))}
          </tbody>
        </table>
      )}
      {legend.length > 0 && (
        <div data-testid="bios-legend" style={{ ...SUBLINE_STYLE, display: "flex", flexDirection: "column" }}>
          {legend.map((entry) => (
            <span key={entry.title}>
              <span style={{ color: MARK_COLOR[entry.tone] }}>{entry.glyph}</span> {entry.title}
            </span>
          ))}
        </div>
      )}
      {view.unanswered > 0 && <div style={MUTED_TEXT_STYLE}>{unansweredLine(view.unanswered)}</div>}
      <div style={BUTTON_ROW_STYLE}>
        <DialogButton
          style={BUTTON_STYLE}
          disabled={!view.canDownloadRequired || busy}
          onClick={() => state.downloadRequired(row.slug, firmware.active_core_label ?? null)}
        >
          {downloadLabel(row, state, "required", downloadRequiredLabel(view.requiredMissing))}
        </DialogButton>
        <DialogButton
          style={BUTTON_STYLE}
          disabled={!view.canDownloadAll || busy}
          onClick={() => state.downloadAll(row.slug)}
        >
          {downloadLabel(row, state, "all", DOWNLOAD_ALL_LABEL)}
        </DialogButton>
        <DialogButton
          style={BUTTON_STYLE}
          disabled={view.deletable === 0 || busy}
          onClick={() =>
            confirmThen(ask, "tender-settings-delete-bios-title", deleteBiosConfirm(row.name), () =>
              state.deleteBios(row.slug),
            )
          }
        >
          <span style={{ color: RED }}>{deleteBiosLabel(view.deletable)}</span>
        </DialogButton>
      </div>
      <GroupStatus row={row} state={state} scope="bios" />
    </section>
  );
};

/**
 * Neither button is hidden when its count is zero: a platform whose shortcuts
 * were removed but whose saves remain would otherwise strand those saves, and
 * this is the only page that offers them.
 */
const RemoveSection: FC<PaneProps> = ({ row, state, ask }) => {
  const syncRunning = useSyncRunning();
  const saveCount = state.saveCountFor(row.slug);
  const busy = state.busySlug !== null;
  return (
    <section style={SECTION_STYLE}>
      <div style={BUTTON_ROW_STYLE}>
        <DialogButton
          style={BUTTON_STYLE}
          disabled={busy || syncRunning || row.shortcutCount === 0}
          onClick={() =>
            confirmThen(ask, "tender-settings-remove-shortcuts-title", removeShortcutsConfirm(row), () =>
              state.removeShortcuts(row),
            )
          }
        >
          <span style={{ color: RED }}>{removeShortcutsLabel(row.shortcutCount)}</span>
        </DialogButton>
        {/* Disabled and spinning while the count is unread: a press over an
            unknown set is not offered, and a 0 would claim an emptiness. */}
        <DialogButton
          style={BUTTON_STYLE}
          disabled={busy || saveCount === undefined || saveCount === 0}
          onClick={() =>
            confirmThen(ask, "tender-settings-delete-saves-title", deleteSavesConfirm(row.name), () =>
              state.deleteSaves(row),
            )
          }
        >
          <span style={{ color: RED, display: "inline-flex", alignItems: "center", gap: "6px" }}>
            {saveCount === undefined && <Spinner width={12} height={12} />}
            {deleteSavesLabel(saveCount)}
          </span>
        </DialogButton>
      </div>
      {saveCount === null && <div style={MUTED_TEXT_STYLE}>{SAVE_COUNT_FAILED}</div>}
      {syncRunning && <div style={MUTED_TEXT_STYLE}>{REMOVING_DURING_SYNC}</div>}
      <GroupStatus row={row} state={state} scope="remove" />
    </section>
  );
};

export const PlatformDetailPane: FC<PaneProps> = ({ row, state, ask }) => {
  const core = state.coreFor(row.slug);
  const offer = coreOffer(core);
  const { clause, tone } = coreClause(core);
  const absence = biosAbsence(row);
  return (
    <div data-testid={`platform-detail-${row.slug}`}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={DETAIL_TITLE_STYLE}>{row.name}</div>
          <div style={{ fontSize: "13px", color: MUTED }}>
            {headerCounts(row)}
            {clause && <span style={{ color: CORE_COLOR[tone] }}>{` · ${clause}`}</span>}
          </div>
        </div>
        {/* Always drawn, disabled where there is nothing to pick, with the
            reason in its tooltip. */}
        <DialogButton
          style={CORE_BUTTON_STYLE}
          title={offer.kind === "pick" ? CORE_BUTTON_TITLE : offer.reason}
          aria-label={CORE_BUTTON_TITLE}
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
                platformCoreLabel: null,
                onPick: (label) => state.changeCore(row.slug, label),
              }),
              getEventTarget(e),
            );
          }}
        >
          <FaMicrochip size={16} color={CORE_COLOR[tone]} />
        </DialogButton>
      </div>
      {state.shortcutCountsFailed && <div style={MUTED_TEXT_STYLE}>{SHORTCUT_COUNTS_FAILED}</div>}
      {state.removalProgress?.slug === row.slug && (
        <div style={MUTED_TEXT_STYLE}>
          {removalProgressLine(state.removalProgress.removed, state.removalProgress.total)}
        </div>
      )}
      {state.busySlug !== null && state.busySlug !== row.slug && (
        <div style={MUTED_TEXT_STYLE}>{busyElsewhereLine(busyPlatformName(state))}</div>
      )}
      {offer.kind === "blocked" && offer.notice !== undefined && <div style={MUTED_TEXT_STYLE}>{offer.notice}</div>}
      <GroupStatus row={row} state={state} scope="core" />
      {row.firmwareStale && <div style={MUTED_TEXT_STYLE}>{BIOS_STALE}</div>}
      {row.firmware ? (
        <BiosSection row={row} state={state} ask={ask} firmware={row.firmware} />
      ) : (
        <section style={SECTION_STYLE}>
          <SectionHeading title={BIOS_HEADING} />
          {absence !== null && <div style={MUTED_TEXT_STYLE}>{BIOS_ABSENCE_LINE[absence]}</div>}
        </section>
      )}
      <RemoveSection row={row} state={state} ask={ask} />
    </div>
  );
};
