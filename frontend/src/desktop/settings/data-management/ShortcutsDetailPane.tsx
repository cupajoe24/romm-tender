/**
 * Detail pane for Shortcuts in Desktop Data Management.
 */

import type { FC } from "react";
import { DialogButton } from "@decky/ui";
import { detach } from "../../../utils/detach";
import { pluralize } from "../../../utils/pluralize";
import { figureLine } from "../../../utils/dataInventoryView";
import { SYNC_RUNNING_HINT, useSyncRunning } from "../../../utils/syncRunning";
import type { DataPageState } from "../../../utils/useDataPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { BUTTON_ROW_STYLE, BUTTON_STYLE, MUTED_TEXT_STYLE, RED, SECTION_STYLE } from "../settingsStyles";

export interface ShortcutsDetailPaneProps {
  state: DataPageState;
  ask: AskDialog;
}

export const ShortcutsDetailPane: FC<ShortcutsDetailPaneProps> = ({ state, ask }) => {
  const syncRunning = useSyncRunning();

  const handleRemoveShortcuts = () => {
    detach(
      (async () => {
        const yes = await ask(false, (resolve) => (
          <DesktopConfirmDialog
            titleId="confirm-remove-shortcuts-title"
            title="Remove Shortcuts"
            description="Remove every RomM shortcut? Downloaded ROM files and save files are kept. The next library sync will recreate the shortcuts."
            confirmLabel="Remove All Shortcuts"
            cancelLabel="Cancel"
            tone="danger"
            onChoice={resolve}
          />
        ));
        if (yes) {
          void state.removeAllShortcuts();
        }
      })(),
    );
  };

  return (
    <section style={SECTION_STYLE} data-testid="shortcuts-detail-pane">
      <SectionHeading title="Tender's Shortcuts" />
      <div style={MUTED_TEXT_STYLE}>
        The Steam entries Tender created for your RomM games. Removing them leaves downloaded ROM files and save files
        where they are; the next sync puts the shortcuts back.
      </div>
      <div style={{ ...MUTED_TEXT_STYLE, fontWeight: 600 }}>
        {figureLine(state.shortcutCount, "The shortcut count", (count) => `${pluralize(count, "shortcut")} in Steam`)}
      </div>

      <div style={BUTTON_ROW_STYLE}>
        <DialogButton style={BUTTON_STYLE} disabled={state.busy || syncRunning} onClick={handleRemoveShortcuts}>
          <span style={{ color: RED }}>Remove all shortcuts</span>
        </DialogButton>
      </div>

      {syncRunning && <div style={MUTED_TEXT_STYLE}>{SYNC_RUNNING_HINT}</div>}
      {state.shortcutStatus && (
        <div role="status" data-testid="status-shortcuts" style={MUTED_TEXT_STYLE}>
          {state.shortcutStatus}
        </div>
      )}
    </section>
  );
};
