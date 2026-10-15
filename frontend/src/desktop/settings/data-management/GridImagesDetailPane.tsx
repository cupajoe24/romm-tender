/**
 * Detail pane for Orphaned Grid Images in Desktop Data Management.
 */

import type { FC } from "react";
import { DialogButton } from "@decky/ui";
import { detach } from "../../../utils/detach";
import { pluralize } from "../../../utils/pluralize";
import { gridImagesFigures } from "../../../utils/dataInventoryView";
import { SYNC_RUNNING_HINT, useSyncRunning } from "../../../utils/syncRunning";
import type { DataPageState } from "../../../utils/useDataPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { BUTTON_ROW_STYLE, BUTTON_STYLE, MUTED_TEXT_STYLE, RED, SECTION_STYLE } from "../settingsStyles";

export interface GridImagesDetailPaneProps {
  state: DataPageState;
  ask: AskDialog;
}

export const GridImagesDetailPane: FC<GridImagesDetailPaneProps> = ({ state, ask }) => {
  const syncRunning = useSyncRunning();
  const read = state.orphanedGridImages;
  const found = read.state === "answered" ? read.value : null;
  const scanning = read.state === "reading";
  const line = gridImagesFigures(read);

  const handleRemoveImages = (count: number) => {
    detach(
      (async () => {
        const yes = await ask(false, (resolve) => (
          <DesktopConfirmDialog
            titleId="confirm-remove-grid-images-title"
            title="Remove Orphaned Images"
            description={`Remove ${pluralize(count, "orphaned image")} left over from removed shortcuts? Images of games still in your library are kept.`}
            confirmLabel="Remove Images"
            cancelLabel="Cancel"
            tone="danger"
            onChoice={resolve}
          />
        ));
        if (yes) {
          void state.cleanupGridImages(true);
        }
      })(),
    );
  };

  return (
    <section style={SECTION_STYLE} data-testid="grid-images-detail-pane">
      <SectionHeading title="Orphaned Grid Images" />
      <div style={MUTED_TEXT_STYLE}>
        Steam keeps the images it shows for a shortcut after the shortcut is gone. These are the leftovers: images whose
        shortcut no longer exists. Images of games still in your library — including games Tender did not add — are
        kept.
      </div>
      {line !== null && <div style={{ ...MUTED_TEXT_STYLE, fontWeight: 600 }}>{line}</div>}

      <div style={BUTTON_ROW_STYLE}>
        {found === null || found === 0 ? (
          <DialogButton
            style={BUTTON_STYLE}
            disabled={state.busy || syncRunning || scanning}
            onClick={() => detach(state.cleanupGridImages(false))}
          >
            {scanning ? "Scanning…" : "Scan for orphaned images"}
          </DialogButton>
        ) : (
          <DialogButton
            style={BUTTON_STYLE}
            disabled={state.busy || syncRunning}
            onClick={() => handleRemoveImages(found)}
          >
            <span style={{ color: RED }}>{`Remove ${pluralize(found, "orphaned image")}`}</span>
          </DialogButton>
        )}
      </div>

      {syncRunning && <div style={MUTED_TEXT_STYLE}>{SYNC_RUNNING_HINT}</div>}
      {state.gridStatus && (
        <div role="status" data-testid="status-grid-images" style={MUTED_TEXT_STYLE}>
          {state.gridStatus}
        </div>
      )}
    </section>
  );
};
