/**
 * The Tender Settings window's Data Management tab: an inventory of what this
 * device holds across six populations (Shortcuts, Installed ROMs, Orphaned grid images,
 * Other non-Steam games, Gone from RomM, and Recovery bundles).
 *
 * Sized and styled for the Steam Desktop settings window with DrillDown navigation
 * and desktop dialog confirmations.
 */

import { useState, type FC } from "react";
import type { DataRowId } from "../../../utils/dataRows";
import { useDataPage } from "../../../utils/useDataPage";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { DrillDown } from "../DrillDown";
import { DataManagementListPane } from "./DataManagementListPane";
import { ShortcutsDetailPane } from "./ShortcutsDetailPane";
import { RomFilesDetailPane } from "./RomFilesDetailPane";
import { GridImagesDetailPane } from "./GridImagesDetailPane";
import { NonSteamDetailPane } from "./NonSteamDetailPane";
import { RemovedGamesDetailPane } from "./RemovedGamesDetailPane";
import { RecoveryBundlesDetailPane } from "./RecoveryBundlesDetailPane";

/**
 * Unique lease owner for desktop Data Management so closing or unmounting
 * this window does not release leases held by Big Picture or other surfaces.
 */
export const LEASE_OWNER = "tender-settings-data-management";

export const DataManagementTab: FC = () => {
  const state = useDataPage(LEASE_OWNER);
  const dialogs = useDialogHost();
  const [selectedRow, setSelectedRow] = useState<DataRowId | null>(null);

  const renderDetail = () => {
    switch (selectedRow) {
      case "shortcuts":
        return <ShortcutsDetailPane state={state} ask={dialogs.ask} />;
      case "rom-files":
        return <RomFilesDetailPane state={state} ask={dialogs.ask} />;
      case "grid-images":
        return <GridImagesDetailPane state={state} ask={dialogs.ask} />;
      case "non-steam":
        return <NonSteamDetailPane state={state} ask={dialogs.ask} />;
      case "removed-games":
        return <RemovedGamesDetailPane state={state} ask={dialogs.ask} />;
      case "recovery-bundles":
        return <RecoveryBundlesDetailPane state={state} />;
      default:
        return null;
    }
  };

  return (
    <div data-testid="tender-settings-data-management">
      <DrillDown
        open={selectedRow !== null}
        onBack={() => setSelectedRow(null)}
        list={<DataManagementListPane state={state} onOpen={(id) => setSelectedRow(id)} />}
        detail={renderDetail()}
      />
      {dialogs.element}
    </div>
  );
};
