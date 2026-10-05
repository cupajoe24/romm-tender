/**
 * The Settings page: six sections on the left, the focused section's controls
 * on the right.
 *
 * Every section's state and every handler is `useSettingsPage`'s rather than the
 * section components', which are pure renderers — the pane mounts only the
 * focused section, so a section owning its own reads would re-issue them on each
 * move through the list. What stays here is the QAM's own: the selection, the
 * two questions drawn as gamepad modals, and the two carries a QAM remount
 * needs (`pendingEdits`, `saveSyncToggleKey`).
 *
 * Structure and vocabulary: `docs/architecture/qam-panel.md`, section Settings.
 */

import { useState, FC, type ReactNode } from "react";
import { ConfirmModal, Field, showModal } from "@decky/ui";
import { verifySgdbApiKey } from "../api/backend";
import type { SettingsSection } from "../types";
import { SETTINGS_SECTIONS } from "../types";
import { useSeenAfterDwell } from "../utils/updateDot";
import { ENABLE_SAVE_SYNC_CONFIRM } from "../utils/settingsWording";
import { useSettingsPage, type SettingsPrompts } from "../utils/useSettingsPage";
import { WidePage } from "./layout/WidePage";
import { ListDetail, type ListDetailItem } from "./layout/ListDetail";
import { ROW_MARKER_GAP, ROW_MARKER_WIDTH, SELECTION_ACCENT } from "./layout/pane";
import { pendingEdits } from "./settings/TextInputModal";
import { ConnectionSection } from "./settings/ConnectionSection";
import { SteamGridDBSection } from "./settings/SteamGridDBSection";
import { SaveSyncSection } from "./settings/SaveSyncSection";
import { RegisteredDevicesSection } from "./settings/RegisteredDevicesSection";
import { ControllerSection } from "./settings/ControllerSection";
import { AdvancedSection } from "./settings/AdvancedSection";
import { UpdatesSection } from "./settings/UpdatesSection";
import { WithUpdateDot } from "./UpdateDot";
import { LibrarySection } from "./settings/LibrarySection";
import { showPreferredRegionModal } from "./settings/PreferredRegionModal";

interface SettingsPageProps {
  onBack: () => void;
  /**
   * The section the page opens on — a navigation from one of Main's notices
   * names the one that holds the action it is about. It is the OPENING
   * selection and nothing more: the panel reaches Settings only from Main, so
   * every navigation here mounts the page afresh.
   */
  section?: SettingsSection;
}

// What the list calls each section. The ids and their order are the navigation
// module's, so a section reachable by a jump is a section the list shows.
const SECTION_LABELS: Record<SettingsSection, string> = {
  connections: "Connections",
  "save-sync": "Save Sync",
  controller: "Controller",
  "steam-library": "Steam Library",
  updates: "Updates",
  advanced: "Advanced",
};

/** The list hands its ids back as plain strings; this is where one becomes a
 *  section again — by lookup rather than by assertion, so an id no section
 *  answers to opens the first section instead of typing as one that is absent. */
const asSection = (id: string | null): SettingsSection =>
  SETTINGS_SECTIONS.find((candidate) => candidate === id) ?? SETTINGS_SECTIONS[0];

export const SettingsPage: FC<SettingsPageProps> = ({ onBack, section }) => {
  const [selectedSection, setSelectedSection] = useState<SettingsSection>(section ?? SETTINGS_SECTIONS[0]);
  // Bumped when the enable question is cancelled, which remounts the toggle
  // back at off.
  const [saveSyncToggleKey, setSaveSyncToggleKey] = useState(0);
  // However Updates came to be on screen — from the list, or opened on it by
  // the card's Open Updates — a second of it counts as seeing the release.
  useSeenAfterDwell(selectedSection === "updates");

  const prompts: SettingsPrompts = {
    confirmEnableSaveSync: () =>
      new Promise<boolean>((resolve) => {
        showModal(
          <ConfirmModal
            strTitle={ENABLE_SAVE_SYNC_CONFIRM.title}
            strDescription={ENABLE_SAVE_SYNC_CONFIRM.description}
            strOKButtonText={ENABLE_SAVE_SYNC_CONFIRM.confirm}
            strCancelButtonText={ENABLE_SAVE_SYNC_CONFIRM.cancel}
            onOK={() => resolve(true)}
            onCancel={() => {
              setSaveSyncToggleKey((k) => k + 1);
              resolve(false);
            }}
          />,
        );
      }),
    confirmPreferredRegion: showPreferredRegionModal,
  };
  const state = useSettingsPage(prompts, pendingEdits);
  const saveSyncEnabled = state.saveSyncSettings?.save_sync_enabled ?? false;

  const renderSection = (id: SettingsSection): ReactNode => {
    switch (id) {
      case "connections":
        return (
          <>
            <ConnectionSection
              url={state.url}
              hasToken={state.hasToken}
              allowInsecureSsl={state.allowInsecureSsl}
              status={state.status}
              customHeaderNames={state.customHeaderNames}
              onUrlChange={state.saveUrl}
              onSaveCustomHeaders={state.saveCustomHeaders}
              onConnect={(username, password) => state.signIn({ mode: "credentials", username, password })}
              onConnectToken={(token) => state.signIn({ mode: "token", token })}
              onConnectPairing={(code) => state.signIn({ mode: "pairing", code })}
              onAllowInsecureSslChange={state.setAllowInsecureSsl}
              onSignOut={state.signOut}
            />
            <SteamGridDBSection
              sgdbApiKey={state.sgdbApiKey}
              onVerifyKey={verifySgdbApiKey}
              onSaveKey={state.saveSgdbKey}
            />
          </>
        );
      case "save-sync":
        return (
          <>
            <SaveSyncSection
              saveSyncSettings={state.saveSyncSettings}
              saveSyncToggleKey={saveSyncToggleKey}
              deviceInfo={state.deviceInfo}
              syncing={state.syncing}
              syncStatus={state.syncStatus}
              onToggleSaveSync={state.toggleSaveSync}
              onSettingChange={state.changeSaveSyncSetting}
              onDefaultSlotSubmit={state.submitDefaultSlot}
              onResetDefaultSlot={state.resetDefaultSlot}
              onSyncAll={state.syncAll}
            />
            {saveSyncEnabled && (state.devicesLoading || state.registeredDevices !== null) && (
              <RegisteredDevicesSection
                devicesLoading={state.devicesLoading}
                devicesError={state.devicesError}
                registeredDevices={state.registeredDevices}
              />
            )}
          </>
        );
      case "controller":
        return (
          <ControllerSection
            steamInputMode={state.steamInputMode}
            steamInputStatus={state.steamInputStatus}
            retroarchWarning={state.retroarchWarning}
            retroarchFixStatus={state.retroarchFixStatus}
            applying={state.applyingSteamInput}
            onModeChange={state.changeSteamInputMode}
            onApplyMode={state.applySteamInput}
            onFixInputDriver={state.fixInputDriver}
          />
        );
      case "steam-library":
        return (
          <LibrarySection
            preferredRegion={state.preferredRegion}
            libraryRegions={state.libraryRegions}
            onPreferredRegionChange={state.changePreferredRegion}
            platformGroups={state.platformGroups}
            onPlatformGroupsChange={state.changePlatformGroups}
            namingMode={state.namingMode}
            onNamingModeChange={state.changeNamingMode}
          />
        );
      case "updates":
        return (
          <UpdatesSection
            update={state.update}
            outcome={state.updateOutcome}
            checking={state.checkingForUpdate}
            result={state.updateCheckResult}
            onEnabledChange={state.changeUpdateCheckEnabled}
            onCheckNow={state.checkForUpdateNow}
          />
        );
      case "advanced":
        return <AdvancedSection logLevel={state.logLevel} onLogLevelChange={state.changeLogLevel} />;
    }
  };

  const items: ListDetailItem[] = SETTINGS_SECTIONS.map((id) => ({
    id,
    render: (selected: boolean) => (
      // The marker bar and the label — Updates' with the update dot beside it —
      // and nothing else: these rows carry no control, which is what
      // `selectOnActivate` below is for — the activate handler it adds to the
      // wrapper is what makes the row a focus stop at all.
      <div
        data-testid={`settings-section-${id}`}
        style={{
          borderLeft: `${ROW_MARKER_WIDTH}px solid ${selected ? SELECTION_ACCENT : "transparent"}`,
          paddingLeft: `${ROW_MARKER_GAP}px`,
        }}
      >
        <Field
          label={id === "updates" ? <WithUpdateDot>{SECTION_LABELS[id]}</WithUpdateDot> : SECTION_LABELS[id]}
          bottomSeparator="none"
        />
      </div>
    ),
  }));

  return (
    <WidePage title="Settings" onBack={onBack} ownRegions>
      <ListDetail
        items={items}
        selectedId={selectedSection}
        onSelect={(id) => setSelectedSection(asSection(id))}
        selectOnActivate
        renderDetail={(id) => renderSection(asSection(id))}
      />
    </WidePage>
  );
};
