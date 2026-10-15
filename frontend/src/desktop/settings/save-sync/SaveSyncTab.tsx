/**
 * The Tender Settings window's Save Sync tab: the QAM Settings page's
 * Save Sync section and registered devices table, drawn for the desktop client
 * over the same state and handlers (`useSettingsPage`), formatters and words.
 *
 * Switches use Steam's settings switch (`SettingsToggle`), section headers use
 * Steam's `DialogControlsSectionHeader` (`SectionHeading`), the default save
 * slot is edited via a desktop dialog (`DefaultSlotDialog`), the history limit
 * uses Steam's `Dropdown`, and the registered devices list is rendered as a
 * Steam desktop table.
 */

import type { FC } from "react";
import { DialogButton, Dropdown, Field } from "@decky/ui";
import { detach } from "../../../utils/detach";
import { formatLastSeen } from "../../../utils/formatters";
import {
  CURRENT_DEVICE_LABEL,
  DEVICES_ERROR_LABEL,
  DEVICES_LOADING_LABEL,
  DEVICE_TABLE_HEADERS,
  NO_DEVICES_LABEL,
  REGISTERED_DEVICES_HEADING,
  deviceClientString,
  deviceListState,
  deviceRowTitle,
  isCurrentDevice,
} from "../../../utils/registeredDevices";
import {
  DEFAULT_SAVE_SLOT_LABEL,
  DEVICE_LABEL,
  EDIT_LABEL,
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
} from "../../../utils/settingsWording";
import { useSettingsPage, type SettingsPageState } from "../../../utils/useSettingsPage";
import { useDialogHost, type AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import { SettingsToggle } from "../SettingsToggle";
import { desktopSettingsPrompts } from "../settingsPrompts";
import {
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  GREEN,
  MUTED_TEXT_STYLE,
  RED,
  SECTION_STYLE,
  SUBLINE_STYLE,
  TABLE_STYLE,
  TD_STYLE,
  TH_STYLE,
} from "../settingsStyles";
import { DefaultSlotDialog } from "./DefaultSlotDialog";

const ROW_BUTTON_STYLE = { ...BUTTON_STYLE, minWidth: "90px" };

const SaveSyncControlsSection: FC<{ state: SettingsPageState; ask: AskDialog }> = ({ state, ask }) => {
  const settings = state.saveSyncSettings;
  const saveSyncEnabled = settings?.save_sync_enabled ?? false;

  const openEditSlot = () => {
    if (!settings) return;
    detach(
      ask(undefined, (close) => (
        <DefaultSlotDialog
          currentSlot={settings.default_slot}
          onSave={state.submitDefaultSlot}
          onClose={() => close(undefined)}
        />
      )),
    );
  };

  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={SAVE_SYNC_HEADING} />
      <SettingsToggle
        label={ENABLE_SAVE_SYNC_LABEL}
        description={ENABLE_SAVE_SYNC_DESCRIPTION}
        checked={saveSyncEnabled}
        onChange={(value) => void state.toggleSaveSync(value)}
      />
      {!saveSyncEnabled && <Field label={SAVE_SYNC_DISABLED_LABEL} description={SAVE_SYNC_DISABLED_DESCRIPTION} />}
      {saveSyncEnabled && settings && (
        <>
          {state.deviceInfo?.device_name && (
            <Field label={DEVICE_LABEL} description={deviceRegisteredDescription(state.deviceInfo.device_name)} />
          )}
          <SettingsToggle
            label={SYNC_BEFORE_LAUNCH_LABEL}
            description={SYNC_BEFORE_LAUNCH_DESCRIPTION}
            checked={settings.sync_before_launch}
            onChange={(value) => state.changeSaveSyncSetting({ sync_before_launch: value })}
          />
          <SettingsToggle
            label={SYNC_AFTER_EXIT_LABEL}
            description={SYNC_AFTER_EXIT_DESCRIPTION}
            checked={settings.sync_after_exit}
            onChange={(value) => state.changeSaveSyncSetting({ sync_after_exit: value })}
          />
          <Field
            label={DEFAULT_SAVE_SLOT_LABEL}
            description={
              <>
                <div>{defaultSaveSlotSummary(settings.default_slot)}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                  <DialogButton style={ROW_BUTTON_STYLE} onClick={openEditSlot}>
                    {EDIT_LABEL}
                  </DialogButton>
                  {settings.default_slot !== "default" && (
                    <DialogButton style={ROW_BUTTON_STYLE} onClick={state.resetDefaultSlot}>
                      {RESET_DEFAULT_SLOT_LABEL}
                    </DialogButton>
                  )}
                </div>
              </>
            }
          />
          <Field label={SAVE_HISTORY_LIMIT_LABEL} description={SAVE_HISTORY_LIMIT_DESCRIPTION}>
            <Dropdown
              rgOptions={[...SAVE_HISTORY_LIMIT_OPTIONS]}
              selectedOption={settings.autocleanup_limit}
              onChange={(option) => state.changeSaveSyncSetting({ autocleanup_limit: option.data as number })}
            />
          </Field>
          <div style={BUTTON_ROW_STYLE}>
            <DialogButton style={BUTTON_STYLE} onClick={state.syncAll} disabled={state.syncing}>
              {state.syncing ? SYNCING_ALL_LABEL : SYNC_ALL_SAVES_NOW_LABEL}
            </DialogButton>
          </div>
          {state.syncStatus && (
            <div role="status" style={MUTED_TEXT_STYLE}>
              {state.syncStatus}
            </div>
          )}
        </>
      )}
    </section>
  );
};

const RegisteredDevicesSection: FC<{ state: SettingsPageState }> = ({ state }) => {
  const listState = deviceListState(state.devicesLoading, state.devicesError, state.registeredDevices);

  let body;
  switch (listState.kind) {
    case "loading":
      body = <div style={MUTED_TEXT_STYLE}>{DEVICES_LOADING_LABEL}</div>;
      break;
    case "error":
      body = (
        <div style={{ ...MUTED_TEXT_STYLE, color: RED }}>
          {DEVICES_ERROR_LABEL}
          <div style={SUBLINE_STYLE}>{listState.message}</div>
        </div>
      );
      break;
    case "empty":
      body = <div style={MUTED_TEXT_STYLE}>{NO_DEVICES_LABEL}</div>;
      break;
    case "loaded":
      body = (
        <table style={TABLE_STYLE} data-testid="devices-table">
          <thead>
            <tr>
              {DEVICE_TABLE_HEADERS.map((header) => (
                <th key={header} style={TH_STYLE}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listState.devices.map((device, i) => (
              <tr key={device.id || `idx-${i}`} data-testid={`device-row-${device.id || i}`}>
                <td style={TD_STYLE}>
                  <span>{deviceRowTitle(device)}</span>
                  {isCurrentDevice(device) && (
                    <span style={{ marginLeft: "8px", color: GREEN, fontSize: "12px" }}>{CURRENT_DEVICE_LABEL}</span>
                  )}
                </td>
                <td style={TD_STYLE}>{deviceClientString(device)}</td>
                <td style={TD_STYLE}>{formatLastSeen(device.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
  }

  return (
    <section style={SECTION_STYLE}>
      <SectionHeading title={REGISTERED_DEVICES_HEADING} />
      {body}
    </section>
  );
};

export const SaveSyncTab: FC = () => {
  const dialogs = useDialogHost();
  const state = useSettingsPage(desktopSettingsPrompts(dialogs.ask));

  const saveSyncEnabled = state.saveSyncSettings?.save_sync_enabled ?? false;

  return (
    <div data-testid="tender-settings-save-sync">
      <SaveSyncControlsSection state={state} ask={dialogs.ask} />
      {saveSyncEnabled && <RegisteredDevicesSection state={state} />}
      {dialogs.element}
    </div>
  );
};
