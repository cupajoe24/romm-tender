/**
 * Detail pane for Installed ROM Files in Desktop Data Management.
 */

import type { FC } from "react";
import { DialogButton } from "@decky/ui";
import { detach } from "../../../utils/detach";
import { formatBytes } from "../../../utils/formatters";
import { figureLine } from "../../../utils/dataInventoryView";
import { SYNC_RUNNING_HINT, useSyncRunning } from "../../../utils/syncRunning";
import type { DataPageState } from "../../../utils/useDataPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { BUTTON_ROW_STYLE, BUTTON_STYLE, MUTED_TEXT_STYLE, RED, SECTION_STYLE } from "../settingsStyles";

export interface RomFilesDetailPaneProps {
  state: DataPageState;
  ask: AskDialog;
}

export const RomFilesDetailPane: FC<RomFilesDetailPaneProps> = ({ state, ask }) => {
  const syncRunning = useSyncRunning();
  const inventory = state.inventory;
  const isZeroInstalled = inventory.state === "answered" && inventory.value.installed_roms === 0;

  const handleUninstallRoms = () => {
    detach(
      (async () => {
        const yes = await ask(false, (resolve) => (
          <DesktopConfirmDialog
            titleId="confirm-uninstall-roms-title"
            title="Uninstall ROM Files"
            description="Delete every downloaded ROM file? Shortcuts are kept, so the games stay in your library and can be downloaded again."
            confirmLabel="Uninstall All ROMs"
            cancelLabel="Cancel"
            tone="danger"
            onChoice={resolve}
          />
        ));
        if (yes) {
          void state.uninstallAllRoms();
        }
      })(),
    );
  };

  return (
    <section style={SECTION_STYLE} data-testid="rom-files-detail-pane">
      <SectionHeading title="Installed ROM Files" />
      <div style={MUTED_TEXT_STYLE}>
        The ROMs Tender downloaded to your device, one per install — a game you keep two versions of is two of these.
        Removing them keeps every shortcut, so the games stay in your library and can be downloaded again.
      </div>
      <div style={{ ...MUTED_TEXT_STYLE, fontWeight: 600 }}>
        {figureLine(
          inventory,
          "The installed-ROM figures",
          (read) => `${read.installed_roms} installed · ≈ ${formatBytes(read.installed_bytes)}`,
        )}
      </div>
      <div style={{ ...MUTED_TEXT_STYLE, fontSize: "12px" }}>
        The size is what your RomM server reported for these installs, not a measurement of your disk.
      </div>

      <div style={BUTTON_ROW_STYLE}>
        <DialogButton
          style={BUTTON_STYLE}
          disabled={state.busy || syncRunning || isZeroInstalled}
          onClick={handleUninstallRoms}
        >
          <span style={{ color: RED }}>Uninstall all ROM files</span>
        </DialogButton>
      </div>

      {syncRunning && <div style={MUTED_TEXT_STYLE}>{SYNC_RUNNING_HINT}</div>}
      {state.uninstallStatus && (
        <div role="status" data-testid="status-rom-files" style={MUTED_TEXT_STYLE}>
          {state.uninstallStatus}
        </div>
      )}
    </section>
  );
};
