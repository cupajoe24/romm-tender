/**
 * The Tender Settings window's Advanced tab: the QAM Settings page's
 * Advanced section, drawn for the desktop client over the same state and
 * handlers (`useSettingsPage`) and wording (`utils/settingsWording.ts`).
 *
 * Log level uses `SettingsDropdown`.
 */

import type { FC } from "react";
import {
  ADVANCED_HEADING,
  LOG_LEVEL_DESCRIPTION,
  LOG_LEVEL_LABEL,
  LOG_LEVEL_OPTIONS,
} from "../../../utils/settingsWording";
import { useSettingsPage, type SettingsPageState } from "../../../utils/useSettingsPage";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { SettingsDropdown } from "../SettingsDropdown";
import { desktopSettingsPrompts } from "../settingsPrompts";
import { SECTION_STYLE } from "../settingsStyles";

const AdvancedControlsSection: FC<{ state: SettingsPageState }> = ({ state }) => {
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={ADVANCED_HEADING} />
      <SettingsDropdown
        label={LOG_LEVEL_LABEL}
        description={LOG_LEVEL_DESCRIPTION}
        rgOptions={LOG_LEVEL_OPTIONS}
        selectedOption={state.logLevel}
        onChange={(option) => state.changeLogLevel(option.data as string)}
      />
    </section>
  );
};

export const AdvancedTab: FC = () => {
  const dialogs = useDialogHost();
  const state = useSettingsPage(desktopSettingsPrompts(dialogs.ask));

  return (
    <div data-testid="tender-settings-advanced">
      <AdvancedControlsSection state={state} />
      {dialogs.element}
    </div>
  );
};
