/**
 * The Tender Settings window's Steam Library tab: the QAM Settings page's
 * Steam Library section, drawn for the desktop client over the same state and
 * handlers (`useSettingsPage`), region resolution (`utils/preferredRegion.ts`),
 * and wording (`utils/settingsWording.ts`).
 *
 * Preferred region uses `SettingsDropdown`, with changes confirmed via
 * `DesktopConfirmDialog` before saving; a cancelled change remounts the
 * dropdown. Platform groups and
 * collection naming modes use `SettingsToggle` (`Field` + `Toggle`).
 */

import { useState, type FC } from "react";
import { buildRegionOptions } from "../../../utils/preferredRegion";
import {
  COLLECTION_NAMING_MODE_DESCRIPTION,
  COLLECTION_NAMING_MODE_LABEL,
  PLATFORM_GROUPS_DESCRIPTION,
  PLATFORM_GROUPS_LABEL,
  PREFERRED_REGION_DESCRIPTION,
  PREFERRED_REGION_LABEL,
  STEAM_LIBRARY_HEADING,
} from "../../../utils/settingsWording";
import { useSettingsPage, type SettingsPageState } from "../../../utils/useSettingsPage";
import { useDialogHost } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { SettingsDropdown } from "../SettingsDropdown";
import { SettingsToggle } from "../SettingsToggle";
import { desktopSettingsPrompts } from "../settingsPrompts";
import { SECTION_STYLE } from "../settingsStyles";

const SteamLibraryControlsSection: FC<{ state: SettingsPageState; regionDropdownKey: number }> = ({
  state,
  regionDropdownKey,
}) => {
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={STEAM_LIBRARY_HEADING} />
      <SettingsDropdown
        key={regionDropdownKey}
        label={PREFERRED_REGION_LABEL}
        description={PREFERRED_REGION_DESCRIPTION}
        rgOptions={buildRegionOptions(state.libraryRegions, state.preferredRegion)}
        selectedOption={state.preferredRegion}
        onChange={(option) => state.changePreferredRegion(option.data as string)}
      />
      <SettingsToggle
        label={PLATFORM_GROUPS_LABEL}
        description={PLATFORM_GROUPS_DESCRIPTION}
        checked={state.platformGroups}
        onChange={state.changePlatformGroups}
      />
      <SettingsToggle
        label={COLLECTION_NAMING_MODE_LABEL}
        description={COLLECTION_NAMING_MODE_DESCRIPTION}
        checked={state.namingMode === "by_label"}
        onChange={(checked) => state.changeNamingMode(checked ? "by_label" : "merge")}
      />
    </section>
  );
};

export const SteamLibraryTab: FC = () => {
  const dialogs = useDialogHost();
  // Steam's Dropdown holds the option it was last given in state of its own,
  // which an unchanged `selectedOption` never takes back; a "no" to the region
  // question remounts it so it draws the region still in force.
  const [regionDropdownKey, setRegionDropdownKey] = useState(0);
  const prompts = desktopSettingsPrompts(dialogs.ask);
  const state = useSettingsPage({
    ...prompts,
    confirmPreferredRegion: async (fromLabel, toLabel) => {
      const proceed = await prompts.confirmPreferredRegion(fromLabel, toLabel);
      if (!proceed) setRegionDropdownKey((k) => k + 1);
      return proceed;
    },
  });

  return (
    <div data-testid="tender-settings-steam-library">
      <SteamLibraryControlsSection state={state} regionDropdownKey={regionDropdownKey} />
      {dialogs.element}
    </div>
  );
};
