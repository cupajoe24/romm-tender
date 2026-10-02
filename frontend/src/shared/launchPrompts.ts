/**
 * The launch prompts drawn as Steam's gamepad modals — what a start asks
 * through when it is answered with a controller.
 */

import type { LaunchPrompts } from "../utils/launchVerdict";
import { showCoreChangeModal } from "./CoreChangeModal";
import { showFallbackLaunchModal } from "./FallbackLaunchModal";
import { showOfflineDriftModal } from "./OfflineDriftModal";
import { handleConflicts } from "./SyncConflictModal";

export const gamepadLaunchPrompts: LaunchPrompts = {
  confirmCoreChange: (oldLabel, newLabel) => showCoreChangeModal(oldLabel, newLabel),
  resolveConflicts: (conflicts) => handleConflicts(conflicts),
  askOfflineDrift: () => showOfflineDriftModal(),
  confirmFallbackLaunch: (message) => showFallbackLaunchModal(message),
};
