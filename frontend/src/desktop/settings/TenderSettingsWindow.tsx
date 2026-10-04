/**
 * The Tender Settings window: Steam's popup component around Steam's router
 * and `SidebarNavigation`, put together as Steam's own settings window is, under
 * the account provider Steam's own roots carry.
 */

import { useCallback, useMemo } from "react";
import type { SettingsTab } from "../../types/navigation";
import type { SteamSettingsParts } from "./steamSettingsParts";
import { settingsSidebarPages, settingsTabOfRoute, settingsTabRoute } from "./tabs";

export const SETTINGS_WINDOW_TITLE = "Tender Settings";

/** Steam's own settings window's size, which is also its minimum. */
const WIDTH = 850;
const HEIGHT = 722;

/** The key Steam saves the window's size and position under. */
const SAVE_DIMENSIONS_KEY = "TenderSettings";

export interface TenderSettingsWindowProps {
  readonly parts: SteamSettingsParts;
  readonly initialTab: SettingsTab;
  /** The window's own close: its title bar's button, or the window closed by the system. */
  readonly onDismiss: () => void;
  /** The popup's window once Steam has created it, and `undefined` once it is gone. */
  readonly onPopup: (popup: Window | undefined) => void;
  /** A function that moves the open window to a tab. */
  readonly onNavigator: (navigate: (tab: SettingsTab) => void) => void;
  /** A tab the sidebar has moved to. */
  readonly onTabShown: (tab: SettingsTab) => void;
}

export function TenderSettingsWindow({
  parts: { AccountProvider, account, Popup, Router, Sidebar },
  initialTab,
  onDismiss,
  onPopup,
  onNavigator,
  onTabShown,
}: TenderSettingsWindowProps) {
  const pages = useMemo(() => settingsSidebarPages(), []);
  const onPageRequested = useCallback(
    (route: string) => {
      const tab = settingsTabOfRoute(route);
      if (tab) onTabShown(tab);
    },
    [onTabShown],
  );
  const setNavigateToPage = useCallback(
    (navigate: (page: string) => void) => onNavigator((tab) => navigate(settingsTabRoute(tab))),
    [onNavigator],
  );

  return (
    <AccountProvider value={account}>
      <Popup
        strTitle={SETTINGS_WINDOW_TITLE}
        popupWidth={WIDTH}
        popupHeight={HEIGHT}
        minWidth={WIDTH}
        minHeight={HEIGHT}
        resizable
        modal={false}
        saveDimensionsKey={SAVE_DIMENSIONS_KEY}
        onDismiss={onDismiss}
        refPopup={onPopup}
      >
        {/* Without a router of its own, the sidebar would move the library window's. */}
        <Router initialRoute={settingsTabRoute(initialTab)}>
          <Sidebar
            title={SETTINGS_WINDOW_TITLE}
            pages={pages}
            disableRouteReporting
            onPageRequested={onPageRequested}
            fnSetNavigateToPage={setNavigateToPage}
          />
        </Router>
      </Popup>
    </AccountProvider>
  );
}
