/**
 * Controller settings — Steam Input mode dropdown and the "Apply to All
 * Shortcuts" trigger. Pure renderer: parent owns the mode value and the status
 * string.
 */

import { FC } from "react";
import { PanelSection, PanelSectionRow, ButtonItem, Field, DropdownItem } from "@decky/ui";
import {
  APPLY_TO_ALL_SHORTCUTS_LABEL,
  APPLYING_TO_ALL_SHORTCUTS_LABEL,
  CONTROLLER_HEADING,
  STEAM_INPUT_MODE_DESCRIPTION,
  STEAM_INPUT_MODE_LABEL,
  STEAM_INPUT_MODE_OPTIONS,
} from "../../utils/settingsWording";

interface ControllerSectionProps {
  steamInputMode: string;
  steamInputStatus: string;
  /** An apply run is in flight. The button is dead and says so while it is, and
   *  the parent refuses a second press independently — a disabled control still
   *  reports one on the device. */
  applying: boolean;
  onModeChange: (mode: string) => void;
  onApplyMode: () => void;
}

export const ControllerSection: FC<ControllerSectionProps> = ({
  steamInputMode,
  steamInputStatus,
  applying,
  onModeChange,
  onApplyMode,
}) => {
  return (
    <PanelSection title={CONTROLLER_HEADING}>
      <PanelSectionRow>
        <DropdownItem
          label={STEAM_INPUT_MODE_LABEL}
          description={STEAM_INPUT_MODE_DESCRIPTION}
          rgOptions={[...STEAM_INPUT_MODE_OPTIONS]}
          selectedOption={steamInputMode}
          onChange={(option) => onModeChange(option.data)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={onApplyMode} disabled={applying}>
          {applying ? APPLYING_TO_ALL_SHORTCUTS_LABEL : APPLY_TO_ALL_SHORTCUTS_LABEL}
        </ButtonItem>
      </PanelSectionRow>
      {steamInputStatus && (
        <PanelSectionRow>
          {/* Focusable for the reason every read-only row on a wide pane is: the
              region scrolls by moving focus, and rows follow this one. */}
          <Field label={steamInputStatus} focusable={true} />
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};
