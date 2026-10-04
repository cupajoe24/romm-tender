import { describe, it, expect } from "vitest";
import { SETTINGS_SECTIONS, type SettingsTab } from "../../types/navigation";
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TAB_GROUPS,
  settingsSidebarPages,
  settingsTabOfRoute,
  settingsTabRoute,
} from "./tabs";

const EVERY_TAB: readonly SettingsTab[] = [...SETTINGS_SECTIONS, "sync", "library", "downloads", "data-management"];

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

  it("gives every page its tab's route, an icon and no content yet", () => {
    for (const page of settingsSidebarPages()) {
      if (page === "separator") continue;
      expect(settingsTabOfRoute(page.route ?? "")).not.toBeNull();
      expect(page.icon).toBeTruthy();
      expect(page.content).toBeNull();
    }
  });

  it("reads a tab back from its route and nothing from any other route", () => {
    for (const tab of EVERY_TAB) expect(settingsTabOfRoute(settingsTabRoute(tab))).toBe(tab);
    expect(settingsTabOfRoute("/library/home")).toBeNull();
    expect(settingsTabOfRoute(settingsTabRoute("sync").replace("sync", "toString"))).toBeNull();
    expect(settingsTabOfRoute(settingsTabRoute("sync").replace("sync", "nope"))).toBeNull();
  });
});
