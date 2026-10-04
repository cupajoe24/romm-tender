/**
 * The Tender Settings window's tabs: their order, groups, labels and icons, and
 * the routes its sidebar navigates by.
 */

import type { SidebarNavigationPage } from "@decky/ui";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  FaArrowCircleUp,
  FaDatabase,
  FaDownload,
  FaGamepad,
  FaLayerGroup,
  FaPlug,
  FaSave,
  FaSlidersH,
  FaSteam,
  FaSync,
} from "react-icons/fa";
import type { SettingsTab } from "../../types/navigation";

interface TabEntry {
  readonly title: string;
  readonly Icon: IconType;
  /** What the tab shows. Every tab is blank until its content is drawn. */
  readonly content: ReactNode;
}

const TABS: Readonly<Record<SettingsTab, TabEntry>> = {
  sync: { title: "Sync", Icon: FaSync, content: null },
  library: { title: "Library", Icon: FaLayerGroup, content: null },
  downloads: { title: "Downloads", Icon: FaDownload, content: null },
  connections: { title: "Connections", Icon: FaPlug, content: null },
  "save-sync": { title: "Save Sync", Icon: FaSave, content: null },
  controller: { title: "Controller", Icon: FaGamepad, content: null },
  "steam-library": { title: "Steam Library", Icon: FaSteam, content: null },
  updates: { title: "Updates", Icon: FaArrowCircleUp, content: null },
  "data-management": { title: "Data Management", Icon: FaDatabase, content: null },
  advanced: { title: "Advanced", Icon: FaSlidersH, content: null },
};

/** The tabs in sidebar order, in the groups a separator splits them into. */
export const SETTINGS_TAB_GROUPS: readonly (readonly SettingsTab[])[] = [
  ["sync", "library", "downloads"],
  ["connections", "save-sync", "controller", "steam-library"],
  ["updates", "data-management", "advanced"],
];

/** The tab the window opens on when nothing names one. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = "sync";

const ROUTE_PREFIX = "/tender-settings/";

export const settingsTabRoute = (tab: SettingsTab): string => `${ROUTE_PREFIX}${tab}`;

/** The tab a sidebar route names, or `null` for a route that is not one. */
export function settingsTabOfRoute(route: string): SettingsTab | null {
  if (!route.startsWith(ROUTE_PREFIX)) return null;
  const tab = route.slice(ROUTE_PREFIX.length);
  return Object.prototype.hasOwnProperty.call(TABS, tab) ? (tab as SettingsTab) : null;
}

/**
 * The sidebar's page list: each group's tabs, with a separator between groups.
 *
 * Every page says `visible: true`, without which Steam drops the separators and
 * highlights the wrong row: `docs/architecture/desktop-dom-architecture.md`,
 * "The parts Tender's window is built from".
 */
export function settingsSidebarPages(): (SidebarNavigationPage | "separator")[] {
  return SETTINGS_TAB_GROUPS.flatMap((group, index) => [
    ...(index === 0 ? [] : (["separator"] as const)),
    ...group.map((tab) => {
      const { title, Icon, content } = TABS[tab];
      return { title, icon: <Icon />, content, route: settingsTabRoute(tab), visible: true };
    }),
  ]);
}
