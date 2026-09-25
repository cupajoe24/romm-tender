/**
 * The desktop dialogs in the shapes the shared flows ask for: the adoption
 * flow's {@link AdoptionDialogs} and the save-conflict walk's one-conflict
 * question. Every one of them settles with its cancel exit when dismissed.
 */

import type {
  AdoptChoice,
  AdoptionDialogs,
  CandidateChoice,
  CollisionAnswer,
  UnusableChoice,
  VanishedChoice,
} from "../../../utils/adoptFlow";
import type { SyncConflictResolution } from "../../../utils/saveConflictFlow";
import type { SyncConflict } from "../../../types";
import type { AskDialog } from "./useDialogHost";
import { DesktopAdoptCandidatesDialog } from "./DesktopAdoptCandidatesDialog";
import { DesktopAdoptCollisionsDialog } from "./DesktopAdoptCollisionsDialog";
import { DesktopAdoptExistingDialog } from "./DesktopAdoptExistingDialog";
import { DesktopAdoptUnusableDialog } from "./DesktopAdoptUnusableDialog";
import { DesktopAdoptVanishedDialog } from "./DesktopAdoptVanishedDialog";
import { DesktopSaveConflictDialog } from "./DesktopSaveConflictDialog";

export function desktopAdoptionDialogs(ask: AskDialog): AdoptionDialogs {
  return {
    showExisting: (romId, occupied, candidatePath) =>
      ask<AdoptChoice>("cancel", (resolve) => (
        <DesktopAdoptExistingDialog
          romId={romId}
          occupied={occupied}
          candidatePath={candidatePath}
          onChoice={resolve}
        />
      )),
    showCandidates: (found) =>
      ask<CandidateChoice>({ kind: "cancel" }, (resolve) => (
        <DesktopAdoptCandidatesDialog found={found} onChoice={resolve} />
      )),
    showCollisions: (collisions) =>
      ask<CollisionAnswer>("cancel", (resolve) => (
        <DesktopAdoptCollisionsDialog collisions={collisions} onChoice={resolve} />
      )),
    showUnusable: (unusable) =>
      ask<UnusableChoice>("cancel", (resolve) => <DesktopAdoptUnusableDialog unusable={unusable} onChoice={resolve} />),
    showVanished: (vanished) =>
      ask<VanishedChoice>("cancel", (resolve) => <DesktopAdoptVanishedDialog vanished={vanished} onChoice={resolve} />),
  };
}

export function desktopSaveConflictDialog(ask: AskDialog): (conflict: SyncConflict) => Promise<SyncConflictResolution> {
  return (conflict) =>
    ask<SyncConflictResolution>("cancel", (resolve) => (
      <DesktopSaveConflictDialog conflict={conflict} onDone={resolve} />
    ));
}
