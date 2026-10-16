/**
 * Tender-wide developer/diagnostic toggles. Currently houses the log-level
 * dropdown; future additions belong here when they're orthogonal to any other
 * panel. Pure renderer: parent owns the current log level.
 */

import { FC } from "react";
import { DropdownItem, PanelSection, PanelSectionRow } from "@decky/ui";
import {
  ADVANCED_HEADING,
  LOG_LEVEL_DESCRIPTION,
  LOG_LEVEL_LABEL,
  LOG_LEVEL_OPTIONS,
} from "../../utils/settingsWording";

interface AdvancedSectionProps {
  logLevel: string;
  onLogLevelChange: (level: string) => void;
}

export const AdvancedSection: FC<AdvancedSectionProps> = ({ logLevel, onLogLevelChange }) => {
  return (
    <PanelSection title={ADVANCED_HEADING}>
      <PanelSectionRow>
        <DropdownItem
          label={LOG_LEVEL_LABEL}
          description={LOG_LEVEL_DESCRIPTION}
          rgOptions={[...LOG_LEVEL_OPTIONS]}
          selectedOption={logLevel}
          onChange={(option) => onLogLevelChange(option.data)}
        />
      </PanelSectionRow>
    </PanelSection>
  );
};
