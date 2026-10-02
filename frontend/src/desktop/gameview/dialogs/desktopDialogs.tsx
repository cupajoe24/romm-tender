/**
 * The desktop dialogs in the shapes the shared flows ask for: the adoption
 * flow's {@link AdoptionDialogs}, the save-conflict walk's one-conflict
 * question and a launch's {@link LaunchPrompts}. Every one of them settles with
 * its cancel exit when dismissed.
 */

import type {
  AdoptChoice,
  AdoptionDialogs,
  CandidateChoice,
  CollisionAnswer,
  UnusableChoice,
  VanishedChoice,
} from "../../../utils/adoptFlow";
import { resolveConflictsSequentially, type SyncConflictResolution } from "../../../utils/saveConflictFlow";
import type { LaunchPrompts } from "../../../utils/launchVerdict";
import type { SyncConflict } from "../../../types";
import type { AskDialog } from "./useDialogHost";
import { DesktopAdoptCandidatesDialog } from "./DesktopAdoptCandidatesDialog";
import { DesktopAdoptCollisionsDialog } from "./DesktopAdoptCollisionsDialog";
import { DesktopAdoptExistingDialog } from "./DesktopAdoptExistingDialog";
import { DesktopAdoptUnusableDialog } from "./DesktopAdoptUnusableDialog";
import { DesktopAdoptVanishedDialog } from "./DesktopAdoptVanishedDialog";
import { DesktopSaveConflictDialog } from "./DesktopSaveConflictDialog";
import { DesktopOfflineDriftDialog } from "./DesktopOfflineDriftDialog";
import { DesktopFallbackLaunchDialog } from "./DesktopFallbackLaunchDialog";
import { DesktopCoreChangeDialog } from "./DesktopCoreChangeDialog";
import { DesktopUnsyncedSavesDialog, type UnsyncedSavesChoice } from "./DesktopUnsyncedSavesDialog";

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

export function desktopOfflineDriftDialog(ask: AskDialog): () => Promise<"start_anyway" | "retry" | "cancel"> {
  return () =>
    ask<"start_anyway" | "retry" | "cancel">("cancel", (resolve) => <DesktopOfflineDriftDialog onChoice={resolve} />);
}

export function desktopFallbackLaunchDialog(ask: AskDialog): (message?: string) => Promise<boolean> {
  return (message) =>
    ask<boolean>(false, (resolve) => <DesktopFallbackLaunchDialog message={message} onChoice={resolve} />);
}

export function desktopCoreChangeDialog(ask: AskDialog): (oldLabel: string, newLabel: string) => Promise<boolean> {
  return (oldLabel, newLabel) =>
    ask<boolean>(false, (resolve) => (
      <DesktopCoreChangeDialog oldLabel={oldLabel} newLabel={newLabel} onChoice={resolve} />
    ));
}

export function desktopUnsyncedSavesDialog(
  ask: AskDialog,
): (args: { versionName: string; serverReachable: boolean }) => Promise<UnsyncedSavesChoice> {
  return ({ versionName, serverReachable }) =>
    ask<UnsyncedSavesChoice>("cancel", (resolve) => (
      <DesktopUnsyncedSavesDialog versionName={versionName} serverReachable={serverReachable} onChoice={resolve} />
    ));
}

export function desktopLaunchPrompts(ask: AskDialog): LaunchPrompts {
  return {
    confirmCoreChange: desktopCoreChangeDialog(ask),
    resolveConflicts: (conflicts) => resolveConflictsSequentially(conflicts, desktopSaveConflictDialog(ask)),
    askOfflineDrift: desktopOfflineDriftDialog(ask),
    confirmFallbackLaunch: desktopFallbackLaunchDialog(ask),
  };
}
