/**
 * Save-sync toggles — master enable, sync-before-launch, sync-after-exit,
 * default save slot editor, history-limit dropdown, and the "Sync All" button.
 * Pure renderer: parent owns SaveSyncSettings, deviceInfo, and the sync status.
 */

import { FC } from "react";
import {
  PanelSection,
  PanelSectionRow,
  ButtonItem,
  DialogButton,
  Field,
  DropdownItem,
  showModal,
  ToggleField,
} from "@decky/ui";
import type { SaveSyncSettings as SaveSyncSettingsType } from "../../types";
import {
  DEFAULT_SAVE_SLOT_LABEL,
  DEVICE_LABEL,
  ENABLE_SAVE_SYNC_DESCRIPTION,
  ENABLE_SAVE_SYNC_LABEL,
  RESET_DEFAULT_SLOT_LABEL,
  SAVE_HISTORY_LIMIT_DESCRIPTION,
  SAVE_HISTORY_LIMIT_LABEL,
  SAVE_HISTORY_LIMIT_OPTIONS,
  SAVE_SYNC_DISABLED_DESCRIPTION,
  SAVE_SYNC_DISABLED_LABEL,
  SAVE_SYNC_HEADING,
  SYNC_AFTER_EXIT_DESCRIPTION,
  SYNC_AFTER_EXIT_LABEL,
  SYNC_ALL_SAVES_NOW_LABEL,
  SYNC_BEFORE_LAUNCH_DESCRIPTION,
  SYNC_BEFORE_LAUNCH_LABEL,
  SYNCING_ALL_LABEL,
  defaultSaveSlotSummary,
  deviceRegisteredDescription,
} from "../../utils/settingsWording";
import { TextInputModal } from "./TextInputModal";

interface SaveSyncSectionProps {
  saveSyncSettings: SaveSyncSettingsType | null;
  saveSyncToggleKey: number;
  deviceInfo: { device_id: string; device_name: string } | null;
  syncing: boolean;
  syncStatus: string;
  onToggleSaveSync: (value: boolean) => void;
  onSettingChange: (partial: Partial<SaveSyncSettingsType>) => void;
  onDefaultSlotSubmit: (value: string) => void;
  onResetDefaultSlot: () => void;
  onSyncAll: () => void;
}

export const SaveSyncSection: FC<SaveSyncSectionProps> = ({
  saveSyncSettings,
  saveSyncToggleKey,
  deviceInfo,
  syncing,
  syncStatus,
  onToggleSaveSync,
  onSettingChange,
  onDefaultSlotSubmit,
  onResetDefaultSlot,
  onSyncAll,
}) => {
  const saveSyncEnabled = saveSyncSettings?.save_sync_enabled ?? false;

  return (
    <PanelSection title={SAVE_SYNC_HEADING}>
      {saveSyncSettings ? (
        <>
          <PanelSectionRow>
            <ToggleField
              key={saveSyncToggleKey}
              label={ENABLE_SAVE_SYNC_LABEL}
              description={ENABLE_SAVE_SYNC_DESCRIPTION}
              checked={saveSyncEnabled}
              onChange={onToggleSaveSync}
            />
          </PanelSectionRow>
          {!saveSyncEnabled && (
            <PanelSectionRow>
              <Field label={SAVE_SYNC_DISABLED_LABEL} description={SAVE_SYNC_DISABLED_DESCRIPTION} />
            </PanelSectionRow>
          )}
          {saveSyncEnabled && (
            <>
              {deviceInfo && (
                <PanelSectionRow>
                  {/* Focusable: the pane scrolls by moving focus, and this row
                      sits between two toggles, so it is neither end of the
                      region that gets revealed on its own. */}
                  <Field
                    label={DEVICE_LABEL}
                    description={deviceRegisteredDescription(deviceInfo.device_name)}
                    focusable={true}
                  />
                </PanelSectionRow>
              )}
              <PanelSectionRow>
                <ToggleField
                  label={SYNC_BEFORE_LAUNCH_LABEL}
                  description={SYNC_BEFORE_LAUNCH_DESCRIPTION}
                  checked={saveSyncSettings.sync_before_launch}
                  onChange={(value) => onSettingChange({ sync_before_launch: value })}
                />
              </PanelSectionRow>
              <PanelSectionRow>
                <ToggleField
                  label={SYNC_AFTER_EXIT_LABEL}
                  description={SYNC_AFTER_EXIT_DESCRIPTION}
                  checked={saveSyncSettings.sync_after_exit}
                  onChange={(value) => onSettingChange({ sync_after_exit: value })}
                />
              </PanelSectionRow>
              <PanelSectionRow>
                <Field
                  label={DEFAULT_SAVE_SLOT_LABEL}
                  description={defaultSaveSlotSummary(saveSyncSettings.default_slot)}
                >
                  <DialogButton
                    style={{ minWidth: "auto", width: "auto" }}
                    onClick={() =>
                      showModal(
                        <TextInputModal
                          label={DEFAULT_SAVE_SLOT_LABEL}
                          value={saveSyncSettings.default_slot}
                          onSubmit={onDefaultSlotSubmit}
                        />,
                      )
                    }
                  >
                    Edit
                  </DialogButton>
                </Field>
              </PanelSectionRow>
              {saveSyncSettings.default_slot !== "default" && (
                <PanelSectionRow>
                  <ButtonItem layout="below" onClick={onResetDefaultSlot}>
                    {RESET_DEFAULT_SLOT_LABEL}
                  </ButtonItem>
                </PanelSectionRow>
              )}
              <PanelSectionRow>
                <DropdownItem
                  label={SAVE_HISTORY_LIMIT_LABEL}
                  description={SAVE_HISTORY_LIMIT_DESCRIPTION}
                  rgOptions={[...SAVE_HISTORY_LIMIT_OPTIONS]}
                  selectedOption={saveSyncSettings.autocleanup_limit}
                  onChange={(option) => onSettingChange({ autocleanup_limit: option.data as number })}
                />
              </PanelSectionRow>
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={onSyncAll} disabled={syncing}>
                  {syncing ? SYNCING_ALL_LABEL : SYNC_ALL_SAVES_NOW_LABEL}
                </ButtonItem>
              </PanelSectionRow>
              {syncStatus && (
                <PanelSectionRow>
                  <Field label={syncStatus} focusable={true} />
                </PanelSectionRow>
              )}
            </>
          )}
        </>
      ) : (
        <PanelSectionRow>
          <Field label="Loading..." />
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};
