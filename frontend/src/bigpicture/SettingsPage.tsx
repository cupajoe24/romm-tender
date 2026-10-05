/**
 * The Settings page: eight sections on the left, the focused section's controls
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

import { useState, useEffect, FC, type ReactNode } from "react";
import { ConfirmModal, Field, showModal } from "@decky/ui";
import {
  verifySgdbApiKey,
  getSettings,
  setQamEntryPosition,
  getEmulatorSources,
  setEmulatorSourceEnabled,
  moveEmulatorSource,
  isEndpointFailure,
  logError,
  type EmulatorSourceRefusal,
} from "../api/backend";
import type { SettingsSection, QamEntryPosition, EmulatorSourceDirection, EmulatorSourcesListing } from "../types";
import { SETTINGS_SECTIONS } from "../utils/settingsSections";
import { detach } from "../utils/detach";
import { setQamEntryPositionState } from "../utils/qamEntryPositionStore";
import { useSeenAfterDwell } from "../utils/updateDot";
import { ENABLE_SAVE_SYNC_CONFIRM } from "../utils/settingsWording";
import { useSettingsPage, type SettingsPrompts } from "../utils/useSettingsPage";
import { WidePage } from "./layout/WidePage";
import { ListDetail, type ListDetailItem } from "./layout/ListDetail";
import { ROW_MARKER_GAP, ROW_MARKER_WIDTH, SELECTION_ACCENT } from "./layout/pane";
import { pendingEdits } from "./settings/TextInputModal";
import { ConnectionSection } from "./settings/ConnectionSection";
import { SteamGridDBSection } from "./settings/SteamGridDBSection";
import { SgdbKeySaveRefused } from "./settings/SgdbApiKeyModal";
import { SaveSyncSection } from "./settings/SaveSyncSection";
import { RegisteredDevicesSection } from "./settings/RegisteredDevicesSection";
import { ControllerSection } from "./settings/ControllerSection";
import { AdvancedSection } from "./settings/AdvancedSection";
import { InterfaceSection } from "./settings/InterfaceSection";
import { UpdatesSection } from "./settings/UpdatesSection";
import { EmulatorSourcesSection } from "./settings/EmulatorSourcesSection";
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
  "emulator-sources": "Emulator sources",
  updates: "Updates",
  interface: "Interface",
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

  // Interface state
  const [qamPosition, setQamPosition] = useState<QamEntryPosition>("above_decky");

  // Emulator sources: `undefined` until the listing answers, `null` where it failed.
  const [emulatorSources, setEmulatorSources] = useState<EmulatorSourcesListing | null | undefined>(undefined);
  const [sourcesBusy, setSourcesBusy] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setQamPosition(s.qam_entry_position ?? "above_decky");
      })
      .catch((e) => {
        logError(`Failed to load interface settings: ${e}`);
      });
  }, []);

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

  // --- Interface handler ---
  // The store the Quick Access render handler reads is written only once the
  // backend has taken the value, so a change the backend refused or never
  // received never reaches it.
  const handleQamEntryPositionChange = (position: QamEntryPosition) => {
    const previous = qamPosition;
    setQamPosition(position);
    detach(
      (async () => {
        try {
          const result = await setQamEntryPosition(position);
          if (result.success) setQamEntryPositionState(position);
          else setQamPosition(previous);
        } catch {
          setQamPosition(previous);
        }
      })(),
    );
  };

  /** The listing, or `null` where it could not be read — the one read both the
   *  page's mount and a refused change go through. */
  const fetchEmulatorSources = (): Promise<EmulatorSourcesListing | null> =>
    getEmulatorSources().catch((e: unknown) => {
      logError(`Failed to read the emulator sources: ${e}`);
      return null;
    });

  /** A switch or a move, whose answer is the listing as it now stands. An
   *  accepted one can change which source answers for a game, so every open game
   *  page is told to read its answers again. A refusal means the sources changed
   *  under the page (a source went away), so the page reads them again rather
   *  than keep a row that no longer exists. */
  const writeEmulatorSources = async (write: () => Promise<EmulatorSourcesListing | EmulatorSourceRefusal>) => {
    if (sourcesBusy) return;
    setSourcesBusy(true);
    try {
      const answer = await write();
      if (isEndpointFailure(answer)) {
        logError(`An emulator source change was refused: ${answer.reason}`);
        setEmulatorSources(await fetchEmulatorSources());
      } else {
        setEmulatorSources(answer);
        globalThis.dispatchEvent(new CustomEvent("romm_data_changed", { detail: { type: "emulator_sources" } }));
      }
    } catch (e) {
      logError(`Failed to change the emulator sources: ${e}`);
      setEmulatorSources(await fetchEmulatorSources());
    } finally {
      setSourcesBusy(false);
    }
  };

  useEffect(() => {
    detach(fetchEmulatorSources().then(setEmulatorSources));
  }, []);

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
            applying={state.applyingSteamInput}
            onModeChange={state.changeSteamInputMode}
            onApplyMode={state.applySteamInput}
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
      case "emulator-sources":
        return (
          <EmulatorSourcesSection
            listing={emulatorSources}
            busy={sourcesBusy}
            onSwitch={(kind, enabled) => {
              detach(writeEmulatorSources(() => setEmulatorSourceEnabled(kind, enabled)));
            }}
            onMove={(kind, direction: EmulatorSourceDirection) => {
              detach(writeEmulatorSources(() => moveEmulatorSource(kind, direction)));
            }}
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
      case "interface":
        return (
          <InterfaceSection qamEntryPosition={qamPosition} onQamEntryPositionChange={handleQamEntryPositionChange} />
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
