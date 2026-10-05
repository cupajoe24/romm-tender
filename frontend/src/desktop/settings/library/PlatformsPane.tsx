/**
 * The desktop's Platforms: the list fills the tab, and a platform's name opens
 * its detail in its place (`DrillDown`). A row's toggle is the platform's sync
 * switch, as on the QAM, and works without opening anything. The BIOS dot takes
 * the shared mapping's colour, and an outline for a row whose answer has not
 * arrived, which is not an answer.
 */

import { useState, type FC } from "react";
import { DialogButton, Spinner, ToggleField } from "@decky/ui";
import { FaChevronRight } from "react-icons/fa";
import { biosColorForLevel } from "../../../utils/biosColor";
import {
  AVAILABLE_HEADING,
  DISABLE_ALL_LABEL,
  ENABLE_ALL_LABEL,
  NO_PLATFORMS,
  PLATFORMS_FAILED,
  SYNCED_HEADING,
  biosTooltip,
} from "../../../utils/platformsPageWording";
import type { PlatformRow, PlatformsPageState } from "../../../utils/usePlatformsPage";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { DrillDown } from "../DrillDown";
import {
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  LIST_HEADING_STYLE,
  LIST_ROW_STYLE,
  MUTED,
  MUTED_TEXT_STYLE,
  SELECT_BUTTON_STYLE,
} from "../settingsStyles";
import { PlatformDetailPane } from "./PlatformDetailPane";

const BiosDot: FC<{ row: PlatformRow }> = ({ row }) => {
  const pending = row.firmwareState === "pending";
  return (
    <span
      data-testid={`bios-dot-${row.slug}`}
      title={biosTooltip(row)}
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        boxSizing: "border-box",
        flexShrink: 0,
        backgroundColor: pending ? "transparent" : biosColorForLevel(row.firmware?.bios_level ?? null),
        border: pending ? `1.5px solid ${biosColorForLevel(null)}` : undefined,
      }}
    />
  );
};

const PlatformListRow: FC<{ row: PlatformRow; state: PlatformsPageState; onOpen: (slug: string) => void }> = ({
  row,
  state,
  onOpen,
}) => (
  <div data-testid={`platform-row-${row.slug}`} style={LIST_ROW_STYLE}>
    <button type="button" style={SELECT_BUTTON_STYLE} onClick={() => onOpen(row.slug)}>
      <BiosDot row={row} />
      <span
        style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {row.name}
      </span>
      <FaChevronRight size={10} color={MUTED} style={{ flexShrink: 0 }} />
    </button>
    <ToggleField
      checked={row.syncEnabled}
      bottomSeparator="none"
      onChange={(value: boolean) => state.toggleSync(row, value)}
    />
  </div>
);

const Group: FC<{ title: string; slugs: string[]; state: PlatformsPageState; onOpen: (slug: string) => void }> = ({
  title,
  slugs,
  state,
  onOpen,
}) => {
  const rows = slugs.map((slug) => state.rows.get(slug)).filter((row): row is PlatformRow => row !== undefined);
  if (rows.length === 0) return null;
  return (
    <>
      <div style={LIST_HEADING_STYLE}>{`${title} (${slugs.length})`}</div>
      {rows.map((row) => (
        <PlatformListRow key={row.slug} row={row} state={state} onOpen={onOpen} />
      ))}
    </>
  );
};

export const PlatformsPane: FC<{ state: PlatformsPageState; ask: AskDialog }> = ({ state, ask }) => {
  // The platform the detail shows, kept after Back so the panel does not empty
  // while it slides out.
  const [shown, setShown] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (state.loading) return <Spinner width={24} height={24} />;
  if (state.failed) return <div style={MUTED_TEXT_STYLE}>{PLATFORMS_FAILED}</div>;
  const groups = state.groups;
  if (!groups || state.rows.size === 0) return <div style={MUTED_TEXT_STYLE}>{NO_PLATFORMS}</div>;

  const openPlatform = (slug: string) => {
    // Selecting is what reads the platform's core and save count.
    state.select(slug);
    setShown(slug);
    setOpen(true);
  };
  const row = shown === null ? undefined : state.rows.get(shown);

  return (
    <DrillDown
      open={open}
      onBack={() => setOpen(false)}
      list={
        <div data-testid="platform-list">
          <div style={{ ...BUTTON_ROW_STYLE, marginTop: 0 }}>
            <DialogButton style={BUTTON_STYLE} onClick={() => state.setAllSync(true)}>
              {ENABLE_ALL_LABEL}
            </DialogButton>
            <DialogButton style={BUTTON_STYLE} onClick={() => state.setAllSync(false)}>
              {DISABLE_ALL_LABEL}
            </DialogButton>
          </div>
          {state.listStatus && (
            <div role="status" data-testid="status-list" style={MUTED_TEXT_STYLE}>
              {state.listStatus}
            </div>
          )}
          <Group title={SYNCED_HEADING} slugs={groups.synced} state={state} onOpen={openPlatform} />
          <Group title={AVAILABLE_HEADING} slugs={groups.available} state={state} onOpen={openPlatform} />
        </div>
      }
      detail={row ? <PlatformDetailPane row={row} state={state} ask={ask} /> : null}
    />
  );
};
