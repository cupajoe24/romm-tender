import { describe, expect, it } from "vitest";
import type { RecoveryBundleEntry } from "../types";
import {
  figure,
  figureLine,
  filterForeignApps,
  gridImagesFigures,
  newestFirst,
  nonSteamFigures,
  nonSteamUnidentifiedMessage,
  rowCount,
  rowBaseDescription,
  rowDescription,
  rowStatus,
  scanned,
  toggleWhitelistApp,
} from "./dataInventoryView";
import type { DataPageState, NonSteamApp, PageRead } from "./useDataPage";

describe("dataInventoryView", () => {
  describe("figure and scanned", () => {
    it("handles reading, failed and answered states", () => {
      expect(figure<number>({ state: "reading" }, (v) => v)).toBeNull();
      expect(figure<number>({ state: "failed" }, (v) => v)).toBe("—");
      expect(figure<number>({ state: "answered", value: 42 }, (v) => v)).toBe("42");

      expect(scanned({ state: "not-asked" })).toBe("scan");
      expect(scanned({ state: "reading" })).toBeNull();
      expect(scanned({ state: "failed" })).toBe("—");
      expect(scanned({ state: "answered", value: 12 })).toBe("12");
    });

    it("evaluates rowCount for all populations", () => {
      const mockState: DataPageState = {
        shortcutCount: { state: "answered", value: 10 },
        inventory: {
          state: "answered",
          value: {
            installed_roms: 5,
            installed_bytes: 1024,
            recovery_bundles: 2,
            recovery_bytes: 2048,
            recovery_root: "/recovery",
            recovery_bundle_list: [],
          },
        },
        orphanedGridImages: { state: "not-asked" },
        foreignApps: { state: "answered", value: [{ appId: 1, name: "Chrome" }] },
        removedGames: { state: "answered", value: 3 },
        unidentifiedCount: 0,
        whitelistedIds: new Set([1]),
        disabledDefaults: [],
        customNames: [],
        settingsLoaded: true,
        busy: false,
        busyLabel: "",
        removalProgress: null,
        shortcutStatus: "",
        uninstallStatus: "",
        gridStatus: "",
        nonSteamStatus: "",
        removeAllShortcuts: async () => {},
        uninstallAllRoms: async () => {},
        cleanupGridImages: async () => {},
        removeNonSteamApps: async () => {},
        persistWhitelist: () => {},
        recordRemovedGamesScan: () => {},
      };

      expect(rowCount("shortcuts", mockState)).toBe("10");
      expect(rowCount("rom-files", mockState)).toBe("5");
      expect(rowCount("grid-images", mockState)).toBe("scan");
      expect(rowCount("non-steam", mockState)).toBe("1");
      expect(rowCount("removed-games", mockState)).toBe("3");
      expect(rowCount("recovery-bundles", mockState)).toBe("2");
    });
  });

  describe("figureLine", () => {
    it("formats figure line for initial reads", () => {
      const reading: PageRead<number> = { state: "reading" };
      const failed: PageRead<number> = { state: "failed" };
      const answered: PageRead<number> = { state: "answered", value: 8 };

      expect(figureLine(reading, "Shortcuts", (v) => `${v} found`)).toBe("Reading…");
      expect(figureLine(failed, "Shortcuts", (v) => `${v} found`)).toBe(
        "Shortcuts could not be read — open the page again to retry.",
      );
      expect(figureLine(answered, "Shortcuts", (v) => `${v} found`)).toBe("8 found");
    });
  });

  describe("gridImagesFigures", () => {
    it("formats figures for orphaned grid states", () => {
      expect(gridImagesFigures({ state: "not-asked" })).toBe("Not scanned yet");
      expect(gridImagesFigures({ state: "reading" })).toBeNull();
      expect(gridImagesFigures({ state: "failed" })).toBe(
        "The scan failed — press Scan for orphaned images to try again.",
      );
      expect(gridImagesFigures({ state: "answered", value: 0 })).toBe("0 orphaned images found");
      expect(gridImagesFigures({ state: "answered", value: 1 })).toBe("1 orphaned image found");
      expect(gridImagesFigures({ state: "answered", value: 7 })).toBe("7 orphaned images found");
    });
  });

  describe("nonSteamFigures and messages", () => {
    it("formats non-Steam figures correctly", () => {
      expect(nonSteamFigures({ state: "reading" }, 0, 0)).toBe("Reading…");
      expect(nonSteamFigures({ state: "failed" }, 0, 0)).toBe("Could not be read");
      expect(nonSteamFigures({ state: "answered", value: [] }, 0, 0)).toBe("No other non-Steam games found");
      expect(nonSteamFigures({ state: "answered", value: [{ appId: 1, name: "Chrome" }] }, 1, 0)).toBe(
        "1 entry · 1 protected · 0 would be removed",
      );
      expect(
        nonSteamFigures(
          {
            state: "answered",
            value: [
              { appId: 1, name: "Chrome" },
              { appId: 2, name: "Discord" },
            ],
          },
          1,
          1,
        ),
      ).toBe("2 entries · 1 protected · 1 would be removed");
    });

    it("formats unidentified message", () => {
      expect(nonSteamUnidentifiedMessage(1)).toContain("1 entry could not be identified");
      expect(nonSteamUnidentifiedMessage(4)).toContain("4 entries could not be identified");
    });
  });

  describe("newestFirst", () => {
    it("sorts by day descending, then name ascending, with null days last", () => {
      const a: RecoveryBundleEntry = { name: "Mario", day: "2026-10-01", bytes: 100 };
      const b: RecoveryBundleEntry = { name: "Zelda", day: "2026-10-05", bytes: 200 };
      const c: RecoveryBundleEntry = { name: "Sonic", day: "2026-10-01", bytes: 150 };
      const d: RecoveryBundleEntry = { name: "Kirby", day: null, bytes: 50 };

      const list = [a, b, c, d];
      list.sort(newestFirst);

      expect(list).toEqual([b, a, c, d]);
    });
  });

  describe("toggleWhitelistApp", () => {
    const retrodeck: NonSteamApp = { appId: 10, name: "RetroDECK" };
    const discord: NonSteamApp = { appId: 20, name: "Discord" };

    it("toggles default pattern protection on and off", () => {
      // Initially active (not in disabledDefaults)
      // Toggle OFF: should add "retrodeck" to disabledDefaults
      const resOff = toggleWhitelistApp(retrodeck, false, [], []);
      expect(resOff.disabledDefaults).toContain("retrodeck");

      // Toggle ON: should remove "retrodeck" from disabledDefaults
      const resOn = toggleWhitelistApp(retrodeck, true, ["retrodeck"], []);
      expect(resOn.disabledDefaults).not.toContain("retrodeck");
    });

    it("toggles custom non-pattern protection on and off", () => {
      // Toggle ON: should add "Discord" to customNames
      const resOn = toggleWhitelistApp(discord, true, [], []);
      expect(resOn.customNames).toContain("Discord");

      // Toggle OFF: should remove "Discord" from customNames
      const resOff = toggleWhitelistApp(discord, false, [], ["Discord"]);
      expect(resOff.customNames).not.toContain("Discord");
    });
  });

  describe("filterForeignApps", () => {
    const apps: NonSteamApp[] = [
      { appId: 1, name: "Google Chrome" },
      { appId: 2, name: "Firefox" },
      { appId: 3, name: "RetroDECK" },
    ];

    it("returns all apps when search is empty", () => {
      expect(filterForeignApps(apps, "")).toEqual(apps);
    });

    it("filters apps using fuzzyMatch", () => {
      expect(filterForeignApps(apps, "chrome")).toEqual([{ appId: 1, name: "Google Chrome" }]);
      expect(filterForeignApps(apps, "fox")).toEqual([{ appId: 2, name: "Firefox" }]);
    });
  });

  describe("rowDescription", () => {
    const baseState: DataPageState = {
      shortcutCount: { state: "answered", value: 33 },
      inventory: {
        state: "answered",
        value: {
          installed_roms: 3,
          installed_bytes: 1073741824,
          recovery_bundles: 0,
          recovery_bytes: 0,
          recovery_root: "/recovery",
          recovery_bundle_list: [],
        },
      },
      orphanedGridImages: { state: "not-asked" },
      foreignApps: { state: "answered", value: [{ appId: 1, name: "App" }] },
      removedGames: { state: "not-asked" },
      unidentifiedCount: 0,
      whitelistedIds: new Set(),
      disabledDefaults: [],
      customNames: [],
      settingsLoaded: true,
      busy: false,
      busyLabel: "",
      removalProgress: null,
      shortcutStatus: "",
      uninstallStatus: "",
      gridStatus: "",
      nonSteamStatus: "",
      removeAllShortcuts: async () => {},
      uninstallAllRoms: async () => {},
      cleanupGridImages: async () => {},
      removeNonSteamApps: async () => {},
      persistWhitelist: () => {},
      recordRemovedGamesScan: () => {},
    };

    it("formats answered state for all populations", () => {
      expect(rowDescription("shortcuts", baseState)).toBe(
        "The Steam entries Tender created for your RomM games · 33 shortcuts in Steam",
      );
      expect(rowDescription("rom-files", baseState)).toBe(
        "The ROM files Tender downloaded to your device · 3 installed ROMs (≈ 1.00 GB)",
      );
      expect(rowDescription("grid-images", baseState)).toBe(
        "Leftover artwork and grid images whose shortcuts no longer exist · Not scanned yet",
      );
      expect(rowDescription("non-steam", baseState)).toBe(
        "Everything in your Steam library that neither Steam nor Tender installed · 1 entry",
      );
      expect(rowDescription("removed-games", baseState)).toBe(
        "Games whose entry is gone from your RomM server while local data remains · Not scanned yet",
      );
      expect(rowDescription("recovery-bundles", baseState)).toBe(
        "Snapshots sealed before game removals, kept for recovery · 0 bundles (0 B)",
      );
    });

    it("formats reading states across rows", () => {
      const readingState: DataPageState = {
        ...baseState,
        shortcutCount: { state: "reading" },
        inventory: { state: "reading" },
        orphanedGridImages: { state: "reading" },
        foreignApps: { state: "reading" },
        removedGames: { state: "reading" },
      };

      expect(rowDescription("shortcuts", readingState)).toBe(
        "The Steam entries Tender created for your RomM games · Reading…",
      );
      expect(rowDescription("rom-files", readingState)).toBe(
        "The ROM files Tender downloaded to your device · Reading…",
      );
      expect(rowDescription("grid-images", readingState)).toBe(
        "Leftover artwork and grid images whose shortcuts no longer exist · Scanning…",
      );
      expect(rowDescription("non-steam", readingState)).toBe(
        "Everything in your Steam library that neither Steam nor Tender installed · Reading…",
      );
      expect(rowDescription("removed-games", readingState)).toBe(
        "Games whose entry is gone from your RomM server while local data remains · Scanning…",
      );
      expect(rowDescription("recovery-bundles", readingState)).toBe(
        "Snapshots sealed before game removals, kept for recovery · Reading…",
      );
    });

    it("formats failed states across rows", () => {
      const failedState: DataPageState = {
        ...baseState,
        shortcutCount: { state: "failed" },
        inventory: { state: "failed" },
        orphanedGridImages: { state: "failed" },
        foreignApps: { state: "failed" },
        removedGames: { state: "failed" },
      };

      expect(rowDescription("shortcuts", failedState)).toBe(
        "The Steam entries Tender created for your RomM games · Could not be read",
      );
      expect(rowDescription("rom-files", failedState)).toBe(
        "The ROM files Tender downloaded to your device · Could not be read",
      );
      expect(rowDescription("grid-images", failedState)).toBe(
        "Leftover artwork and grid images whose shortcuts no longer exist · Scan failed",
      );
      expect(rowDescription("non-steam", failedState)).toBe(
        "Everything in your Steam library that neither Steam nor Tender installed · Could not be read",
      );
      expect(rowDescription("removed-games", failedState)).toBe(
        "Games whose entry is gone from your RomM server while local data remains · Scan failed",
      );
      expect(rowDescription("recovery-bundles", failedState)).toBe(
        "Snapshots sealed before game removals, kept for recovery · Could not be read",
      );
    });

    it("formats scanned answered results for grid images and removed games", () => {
      const scannedState: DataPageState = {
        ...baseState,
        orphanedGridImages: { state: "answered", value: 4 },
        removedGames: { state: "answered", value: 2 },
      };

      expect(rowDescription("grid-images", scannedState)).toBe(
        "Leftover artwork and grid images whose shortcuts no longer exist · 4 orphaned images found",
      );
      expect(rowDescription("removed-games", scannedState)).toBe(
        "Games whose entry is gone from your RomM server while local data remains · 2 games found",
      );
    });

    it("returns static explanatory sentence from rowBaseDescription", () => {
      expect(rowBaseDescription("shortcuts")).toBe("The Steam entries Tender created for your RomM games.");
      expect(rowBaseDescription("rom-files")).toBe("The ROM files Tender downloaded to your device.");
      expect(rowBaseDescription("grid-images")).toBe(
        "Leftover artwork and grid images whose shortcuts no longer exist.",
      );
      expect(rowBaseDescription("non-steam")).toBe(
        "Everything in your Steam library that neither Steam nor Tender installed.",
      );
      expect(rowBaseDescription("removed-games")).toBe(
        "Games whose entry is gone from your RomM server while local data remains.",
      );
      expect(rowBaseDescription("recovery-bundles")).toBe("Snapshots sealed before game removals, kept for recovery.");
    });

    it("evaluates rowStatus for live figures and scan states", () => {
      expect(rowStatus("shortcuts", baseState)).toBe("33 shortcuts in Steam");
      expect(rowStatus("rom-files", baseState)).toBe("3 installed ROMs (≈ 1.00 GB)");
      expect(rowStatus("grid-images", baseState)).toBe("Not scanned yet");
      expect(rowStatus("non-steam", baseState)).toBe("1 entry");
      expect(rowStatus("removed-games", baseState)).toBe("Not scanned yet");
      expect(rowStatus("recovery-bundles", baseState)).toBe("0 bundles (0 B)");
    });
  });
});
