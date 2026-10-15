/**
 * Detail pane for Other Non-Steam Games in Desktop Data Management.
 */

import { useState, type FC } from "react";
import { DialogButton, Spinner, TextField, Toggle } from "@decky/ui";
import { detach } from "../../../utils/detach";
import { pluralize } from "../../../utils/pluralize";
import {
  filterForeignApps,
  isDefaultPatternMatch,
  nonSteamFigures,
  nonSteamUnidentifiedMessage,
  toggleWhitelistApp,
} from "../../../utils/dataInventoryView";
import type { DataPageState, NonSteamApp } from "../../../utils/useDataPage";
import { DesktopConfirmDialog } from "../../gameview/dialogs/DesktopConfirmDialog";
import type { AskDialog } from "../../gameview/dialogs/useDialogHost";
import { SectionHeading } from "../SectionHeading";
import {
  BUTTON_ROW_STYLE,
  BUTTON_STYLE,
  LIST_HEADING_STYLE,
  LIST_ROW_STYLE,
  MUTED_TEXT_STYLE,
  RED,
  SECTION_STYLE,
  TEXT,
} from "../settingsStyles";

export interface NonSteamDetailPaneProps {
  state: DataPageState;
  ask: AskDialog;
}

export const NonSteamDetailPane: FC<NonSteamDetailPaneProps> = ({ state, ask }) => {
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [whitelistSearch, setWhitelistSearch] = useState("");

  const foreign = state.foreignApps.state === "answered" ? state.foreignApps.value : null;
  const toRemove = (foreign ?? []).filter((a) => !state.whitelistedIds.has(a.appId));
  const retrodeckAtRisk = toRemove.some((a) => a.name.toLowerCase().includes("retrodeck"));

  const listed = foreign ?? [];
  const filteredApps = filterForeignApps(listed, whitelistSearch);

  const handleToggle = (app: NonSteamApp, checked: boolean) => {
    const { disabledDefaults, customNames } = toggleWhitelistApp(
      app,
      checked,
      state.disabledDefaults,
      state.customNames,
    );
    state.persistWhitelist(disabledDefaults, customNames);
  };

  const handleRemoveGames = () => {
    detach(
      (async () => {
        const yes = await ask(false, (resolve) =>
          retrodeckAtRisk ? (
            <DesktopConfirmDialog
              titleId="confirm-remove-retrodeck-title"
              title="WARNING: RetroDECK Not Protected"
              description={`RetroDECK is NOT in the whitelist and will be permanently removed! This breaks every game Tender launches.\n\nAre you sure you want to remove ${toRemove.length} non-Steam games including RetroDECK?`}
              confirmLabel="Remove RetroDECK & Games"
              cancelLabel="Cancel"
              tone="danger"
              onChoice={resolve}
            />
          ) : (
            <DesktopConfirmDialog
              titleId="confirm-remove-non-steam-title"
              title="Remove Non-Steam Games"
              description={`Remove ${toRemove.length} non-Steam games (${state.whitelistedIds.size} whitelisted)?`}
              confirmLabel="Remove Games"
              cancelLabel="Cancel"
              tone="danger"
              onChoice={resolve}
            />
          ),
        );
        if (yes) {
          void state.removeNonSteamApps(toRemove);
        }
      })(),
    );
  };

  const figures = nonSteamFigures(state.foreignApps, state.whitelistedIds.size, toRemove.length);

  return (
    <section style={SECTION_STYLE} data-testid="non-steam-detail-pane">
      <SectionHeading title="Other Non-Steam Games" />
      <div style={MUTED_TEXT_STYLE}>
        Everything in your Steam library that neither Steam nor Tender installed — emulators, launchers, browsers, games
        you added by hand. Your RomM games are not counted here; they are counted under Tender&apos;s shortcuts. The
        whitelist below protects what you keep; everything else is what the button removes.
      </div>
      <div style={{ ...MUTED_TEXT_STYLE, fontWeight: 600 }}>{figures}</div>

      {state.unidentifiedCount > 0 && (
        <div style={MUTED_TEXT_STYLE}>{nonSteamUnidentifiedMessage(state.unidentifiedCount)}</div>
      )}

      {state.foreignApps.state === "failed" && (
        <div style={MUTED_TEXT_STYLE}>
          Steam&apos;s shortcut list could not be read, so nothing here can be told apart from your RomM games. Nothing
          is removed while that is true — open the page again to retry.
        </div>
      )}

      {foreign !== null && foreign.length > 0 && (
        <>
          <div style={BUTTON_ROW_STYLE}>
            <DialogButton
              style={BUTTON_STYLE}
              disabled={state.busy || toRemove.length === 0}
              onClick={handleRemoveGames}
            >
              <span style={{ color: RED }}>{`Remove ${pluralize(toRemove.length, "non-Steam game")}`}</span>
            </DialogButton>
            <DialogButton style={BUTTON_STYLE} onClick={() => setShowWhitelist(!showWhitelist)}>
              {showWhitelist ? "Hide whitelist" : `Configure whitelist (${state.whitelistedIds.size} protected)`}
            </DialogButton>
          </div>

          {showWhitelist && (
            <div data-testid="whitelist-config-section" style={{ marginTop: "14px" }}>
              {!state.settingsLoaded ? (
                <Spinner width={20} height={20} />
              ) : (
                <>
                  <TextField
                    label="Search games"
                    value={whitelistSearch}
                    onChange={(e) => setWhitelistSearch(e.target.value)}
                  />
                  <div style={LIST_HEADING_STYLE}>
                    {`Toggle ON to protect (${filteredApps.length}/${listed.length}):`}
                  </div>
                  <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid rgba(255,255,255,0.05)" }}>
                    {filteredApps.map((app) => {
                      const isWhitelisted = state.whitelistedIds.has(app.appId);
                      const displayName = isDefaultPatternMatch(app.name) ? `${app.name} (auto)` : app.name;
                      return (
                        <div key={app.appId} style={LIST_ROW_STYLE} data-testid={`whitelist-row-${app.appId}`}>
                          <span
                            style={{
                              flex: "1 1 auto",
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: TEXT,
                            }}
                          >
                            {displayName}
                          </span>
                          <Toggle value={isWhitelisted} onChange={(checked: boolean) => handleToggle(app, checked)} />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {state.nonSteamStatus && (
        <div role="status" data-testid="status-non-steam" style={MUTED_TEXT_STYLE}>
          {state.nonSteamStatus}
        </div>
      )}
    </section>
  );
};
