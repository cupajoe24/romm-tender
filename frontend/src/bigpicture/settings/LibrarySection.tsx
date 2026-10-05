/**
 * Set-and-forget preferences about what the library looks like once it is IN
 * Steam: the preferred-region dropdown (ADR-0021 §3, which region wins when a
 * game has several dumps and the plugin must pick one to bind + name the
 * shortcut after), the collection platform-groups toggle and the naming mode.
 * Pure renderer: parent owns every value and the save/confirm flow.
 *
 * It is titled **Steam Library** rather than Library: the Library page is the
 * RomM side of the same subject — what gets synced — and these are the Steam
 * side, so one word for both would name two different things.
 */

import { FC } from "react";
import { PanelSection, PanelSectionRow, DropdownItem, ToggleField } from "@decky/ui";
import type { CollectionNamingMode } from "../../types";
import { buildRegionOptions } from "../../utils/preferredRegion";

interface LibrarySectionProps {
  preferredRegion: string;
  // Distinct region values found in the locally synced library (from the
  // backend get_known_regions read). Appended after the fixed anchors.
  libraryRegions: string[];
  onPreferredRegionChange: (region: string) => void;
  // Whether a synced collection's games are also added to their platform's
  // Steam group. A set-and-forget library preference, so it lives here rather
  // than on the per-sync Collections tab.
  platformGroups: boolean;
  onPlatformGroupsChange: (enabled: boolean) => void;
  // Steam-collection naming mode (#1539), rendered as a boolean toggle
  // (checked === "by_label"). What the modes do is
  // docs/architecture/steam-non-steam-shortcuts.md § Collection naming mode.
  namingMode: CollectionNamingMode;
  onNamingModeChange: (mode: CollectionNamingMode) => void;
}

export const LibrarySection: FC<LibrarySectionProps> = ({
  preferredRegion,
  libraryRegions,
  onPreferredRegionChange,
  platformGroups,
  onPlatformGroupsChange,
  namingMode,
  onNamingModeChange,
}) => {
  return (
    <PanelSection title="Steam Library">
      <PanelSectionRow>
        <DropdownItem
          label="Preferred region"
          description="When a game has several regional versions, prefer this region for the shortcut and its name. Applies to games synced from now on; existing shortcuts keep their name."
          rgOptions={buildRegionOptions(libraryRegions, preferredRegion)}
          selectedOption={preferredRegion}
          onChange={(option) => onPreferredRegionChange(option.data)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Show collection games in platform groups"
          description="When syncing a collection, also add its games to their platform-specific Steam group."
          checked={platformGroups}
          onChange={onPlatformGroupsChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Distinguish collection types in Steam names"
          description="Keeps collections that share a name apart in Steam instead of merging them: hand-picked collections keep their plain name, and the other kinds get their type added, such as (Smart) or (Franchise). Applies on the next sync."
          checked={namingMode === "by_label"}
          onChange={(v) => onNamingModeChange(v ? "by_label" : "merge")}
        />
      </PanelSectionRow>
    </PanelSection>
  );
};
