/**
 * The Tender Settings window's Steam Library tab: the QAM Settings page's
 * Steam Library section, drawn for the desktop client over the same state and
 * handlers (`useSettingsPage`), region resolution (`utils/preferredRegion.ts`),
 * and wording (`utils/settingsWording.ts`).
 *
 * Preferred region uses Steam's `Dropdown` inside a `Field`, with changes
 * confirmed via `DesktopConfirmDialog` before saving. Platform groups and
 * collection naming modes use `SettingsToggle` (`Field` + `Toggle`).
 */

import type { FC } from "react";
import { Dropdown, Field } from "@decky/ui";
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
import { SettingsToggle } from "../SettingsToggle";
import { desktopSettingsPrompts } from "../settingsPrompts";
import { SECTION_STYLE } from "../settingsStyles";

const SteamLibraryControlsSection: FC<{ state: SettingsPageState }> = ({ state }) => {
  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={STEAM_LIBRARY_HEADING} />
      <Field label={PREFERRED_REGION_LABEL} description={PREFERRED_REGION_DESCRIPTION}>
        <Dropdown
          rgOptions={buildRegionOptions(state.libraryRegions, state.preferredRegion)}
          selectedOption={state.preferredRegion}
          onChange={(option) => state.changePreferredRegion(option.data as string)}
        />
      </Field>
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
  const state = useSettingsPage(desktopSettingsPrompts(dialogs.ask));

  return (
    <div data-testid="tender-settings-steam-library">
      <SteamLibraryControlsSection state={state} />
      {dialogs.element}
    </div>
  );
};
