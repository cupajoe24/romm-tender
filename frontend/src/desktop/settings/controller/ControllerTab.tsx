/**
 * The Tender Settings window's Controller tab: the QAM Settings page's
 * Controller section, drawn for the desktop client over the same state and
 * handlers (`useSettingsPage`) and wording (`utils/settingsWording.ts`).
 *
 * Steam Input mode uses Steam's `Dropdown` inside a `Field`, and Apply to All
 * Shortcuts uses Steam's `DialogButton` in a button row with live status reporting.
 */

import type { FC } from "react";
import { DialogButton, Dropdown, Field } from "@decky/ui";
import {
  APPLY_TO_ALL_SHORTCUTS_LABEL,
  APPLYING_TO_ALL_SHORTCUTS_LABEL,
  CONTROLLER_HEADING,
  STEAM_INPUT_MODE_DESCRIPTION,
  STEAM_INPUT_MODE_LABEL,
  STEAM_INPUT_MODE_OPTIONS,
} from "../../../utils/settingsWording";
import { useSettingsPage, type SettingsPageState } from "../../../utils/useSettingsPage";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { desktopSettingsPrompts } from "../settingsPrompts";
import { BUTTON_ROW_STYLE, BUTTON_STYLE, MUTED_TEXT_STYLE, SECTION_STYLE } from "../settingsStyles";

const ControllerControlsSection: FC<{ state: SettingsPageState }> = ({ state }) => {
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={CONTROLLER_HEADING} />
      <Field label={STEAM_INPUT_MODE_LABEL} description={STEAM_INPUT_MODE_DESCRIPTION}>
        <Dropdown
          rgOptions={[...STEAM_INPUT_MODE_OPTIONS]}
          selectedOption={state.steamInputMode}
          onChange={(option) => state.changeSteamInputMode(option.data as string)}
        />
      </Field>
      <div style={BUTTON_ROW_STYLE}>
        <DialogButton style={BUTTON_STYLE} onClick={state.applySteamInput} disabled={state.applyingSteamInput}>
          {state.applyingSteamInput ? APPLYING_TO_ALL_SHORTCUTS_LABEL : APPLY_TO_ALL_SHORTCUTS_LABEL}
        </DialogButton>
      </div>
      {state.steamInputStatus && (
        <div role="status" style={MUTED_TEXT_STYLE}>
          {state.steamInputStatus}
        </div>
      )}
    </section>
  );
};

export const ControllerTab: FC = () => {
  const dialogs = useDialogHost();
  const state = useSettingsPage(desktopSettingsPrompts(dialogs.ask));

  return (
    <div data-testid="tender-settings-controller">
      <ControllerControlsSection state={state} />
      {dialogs.element}
    </div>
  );
};
