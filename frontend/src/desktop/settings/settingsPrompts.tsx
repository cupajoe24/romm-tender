/**
 * The two questions `useSettingsPage` asks before a change, drawn as desktop
 * confirm dialogs in the settings window's own document, and the one way a
 * settings tab draws a sentence's bold words.
 */

import type { ReactNode } from "react";
import { PREFERRED_REGION_CONFIRM, regionChangeLine } from "../../utils/preferredRegion";
import { ENABLE_SAVE_SYNC_CONFIRM, type Phrase } from "../../utils/settingsWording";
import type { SettingsPrompts } from "../../utils/useSettingsPage";
import { DesktopConfirmDialog } from "../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../gameview/dialogs/useDialogHost";

export const renderPhrase = (phrase: Phrase): ReactNode[] =>
  phrase.map((run) => (run.strong ? <strong key={run.text}>{run.text}</strong> : run.text));

/** The questions, each asked through *ask*; a dialog left without an answer answers no. */
export function desktopSettingsPrompts(ask: AskDialog): SettingsPrompts {
  return {
    confirmEnableSaveSync: () =>
      ask(false, (resolve) => (
        <DesktopConfirmDialog
          titleId="tender-settings-enable-save-sync-title"
          title={ENABLE_SAVE_SYNC_CONFIRM.title}
          description={ENABLE_SAVE_SYNC_CONFIRM.description}
          confirmLabel={ENABLE_SAVE_SYNC_CONFIRM.confirm}
          cancelLabel={ENABLE_SAVE_SYNC_CONFIRM.cancel}
          onChoice={resolve}
        />
      )),
    confirmPreferredRegion: (fromLabel, toLabel) =>
      ask(false, (resolve) => (
        <DesktopConfirmDialog
          titleId="tender-settings-preferred-region-title"
          title={PREFERRED_REGION_CONFIRM.title}
          description={
            <>
              <p style={{ margin: "0 0 10px" }}>{regionChangeLine(fromLabel, toLabel)}</p>
              {PREFERRED_REGION_CONFIRM.paragraphs.map((paragraph) => (
                <p key={paragraph[0]?.text} style={{ margin: "0 0 10px" }}>
                  {renderPhrase(paragraph)}
                </p>
              ))}
            </>
          }
          confirmLabel={PREFERRED_REGION_CONFIRM.confirm}
          cancelLabel={PREFERRED_REGION_CONFIRM.cancel}
          onChoice={resolve}
        />
      )),
  };
}
