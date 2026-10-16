import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import type { SettingsTab } from "../../types/navigation";
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TAB_GROUPS,
  settingsSidebarPages,
  settingsTabOfRoute,
  settingsTabRoute,
} from "./tabs";
import { ConnectionsTab } from "./connections/ConnectionsTab";
import { ControllerTab } from "./controller/ControllerTab";
import { DataManagementTab } from "./data-management/DataManagementTab";
import { DownloadsTab } from "./downloads/DownloadsTab";
import { LibraryTab } from "./library/LibraryTab";
import { SaveSyncTab } from "./save-sync/SaveSyncTab";
import { SteamLibraryTab } from "./steam-library/SteamLibraryTab";
import { SyncTab } from "./sync/SyncTab";

const EVERY_TAB: readonly SettingsTab[] = [
  "connections",
  "save-sync",
  "controller",
  "steam-library",
  "updates",
  "advanced",
  "sync",
  "library",
  "downloads",
  "data-management",
];

describe("the settings window's tabs", () => {
  it("lists every tab exactly once, in the three groups the window shows", () => {
    expect(SETTINGS_TAB_GROUPS).toEqual([
      ["sync", "library", "downloads"],
      ["connections", "save-sync", "controller", "steam-library"],
      ["updates", "data-management", "advanced"],
    ]);
    expect([...SETTINGS_TAB_GROUPS.flat()].sort()).toEqual([...EVERY_TAB].sort());
  });

  it("opens on the first tab of the first group", () => {
    expect(DEFAULT_SETTINGS_TAB).toBe(SETTINGS_TAB_GROUPS[0]?.[0]);
  });

  it("puts a separator between groups and none at either end", () => {
    const pages = settingsSidebarPages();
    expect(pages.map((page) => (page === "separator" ? "|" : page.title))).toEqual([
      "Sync",
      "Library",
      "Downloads",
      "|",
      "Connections",
      "Save Sync",
      "Controller",
      "Steam Library",
      "|",
      "Updates",
      "Data Management",
      "Advanced",
    ]);
  });

  it("marks every page visible, which is what keeps Steam's page list drawing the separators", () => {
    for (const page of settingsSidebarPages()) {
      if (page !== "separator") expect(page.visible).toBe(true);
    }
  });

  it("gives every page its tab's route and an icon, and content only to the tabs drawn so far", () => {
    const drawn: string[] = [];
    for (const page of settingsSidebarPages()) {
      if (page === "separator") continue;
      expect(settingsTabOfRoute(page.route ?? "")).not.toBeNull();
      expect(page.icon).toBeTruthy();
      if (page.content !== null) drawn.push(String(page.title));
    }
    expect(drawn).toEqual([
      "Sync",
      "Library",
      "Downloads",
      "Connections",
      "Save Sync",
      "Controller",
      "Steam Library",
      "Data Management",
    ]);
  });

  it("draws the Sync tab as SyncTab", () => {
    const sync = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Sync");
    expect(sync !== "separator" && isValidElement(sync?.content) && sync.content.type).toBe(SyncTab);
  });

  it("draws the Library tab as LibraryTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Library");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(LibraryTab);
  });

  it("draws the Downloads tab as DownloadsTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Downloads");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(DownloadsTab);
  });

  it("draws the Connections tab as ConnectionsTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Connections");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(ConnectionsTab);
  });

  it("draws the Save Sync tab as SaveSyncTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Save Sync");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(SaveSyncTab);
  });

  it("draws the Controller tab as ControllerTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Controller");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(ControllerTab);
  });

  it("draws the Steam Library tab as SteamLibraryTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Steam Library");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(SteamLibraryTab);
  });

  it("draws the Data Management tab as DataManagementTab", () => {
    const tab = settingsSidebarPages().find((page) => page !== "separator" && page.title === "Data Management");
    expect(tab !== "separator" && isValidElement(tab?.content) && tab.content.type).toBe(DataManagementTab);
  });
  it("reads a tab back from its route and nothing from any other route", () => {
    for (const tab of EVERY_TAB) expect(settingsTabOfRoute(settingsTabRoute(tab))).toBe(tab);
    expect(settingsTabOfRoute("/library/home")).toBeNull();
    expect(settingsTabOfRoute(settingsTabRoute("sync").replace("sync", "toString"))).toBeNull();
    expect(settingsTabOfRoute(settingsTabRoute("sync").replace("sync", "nope"))).toBeNull();
  });
});
