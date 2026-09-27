/**
 * Core change detection utility.
 *
 * Detects whether the emulator core configured for a game changed since its last
 * launch. If changed, prompts the user via a UI-appropriate confirmation dialog
 * (Big Picture modal or Desktop dialog) warning of potential save-compatibility
 * issues.
 */

import { checkCoreChange, debugLog } from "../api/backend";
import { detach } from "./detach";

export type CoreChangePrompt = (oldLabel: string, newLabel: string) => Promise<boolean>;

/**
 * Checks for a core change on the specified ROM. If changed, invokes `prompt`
 * with human-readable labels (or core IDs if labels are absent).
 *
 * Returns `true` to proceed with launch, or `false` if the user cancelled.
 * If the check fails or throws, logs the error and safely assumes unchanged (`true`).
 */
export async function confirmCoreChangeIfNeeded(
  romId: number,
  prompt: CoreChangePrompt,
  onError?: (e: unknown) => void,
): Promise<boolean> {
  const coreCheck = await checkCoreChange(romId).catch(
    (e): { changed: boolean; old_core?: string; new_core?: string; old_label?: string; new_label?: string } => {
      if (onError) {
        onError(e);
      } else {
        detach(debugLog(`Core-change check failed (assuming unchanged): ${e}`));
      }
      return { changed: false };
    },
  );
  if (!coreCheck.changed) return true;
  return prompt(
    coreCheck.old_label ?? coreCheck.old_core ?? "Unknown",
    coreCheck.new_label ?? coreCheck.new_core ?? "Unknown",
  );
}
