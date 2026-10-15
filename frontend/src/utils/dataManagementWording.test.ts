import { describe, expect, it } from "vitest";
import {
  DATA_MANAGEMENT_TITLE,
  GRID_IMAGES_DESCRIPTION,
  NON_STEAM_DESCRIPTION,
  RECOVERY_BUNDLES_EMPTY_NOTE,
  RECOVERY_BUNDLES_PRESENT_NOTE,
  RECOVERY_TABLE_HEADINGS,
  REMOVED_GAMES_DESCRIPTION,
  REMOVE_ALL_SHORTCUTS_CONFIRM_DESC,
  REMOVE_ALL_SHORTCUTS_LABEL,
  REMOVE_GRID_IMAGES_TITLE,
  REMOVE_NON_STEAM_TITLE,
  RETRODECK_DANGER_DESC,
  RETRODECK_DANGER_TITLE,
  ROM_FILES_DESCRIPTION,
  ROM_FILES_SIZE_NOTE,
  SHORTCUTS_DESCRIPTION,
  UNINSTALL_ALL_ROMS_CONFIRM_DESC,
  UNINSTALL_ALL_ROMS_LABEL,
  recoveryBundlesDescription,
  removeGridImagesConfirm,
  removeGridImagesConfirmDesc,
  removeGridImagesLabel,
  removeNonSteamConfirmDesc,
  removeNonSteamLabel,
} from "./dataManagementWording";

describe("dataManagementWording", () => {
  it("exports expected title and section descriptions", () => {
    expect(DATA_MANAGEMENT_TITLE).toBe("Data Management");
    expect(SHORTCUTS_DESCRIPTION).toContain("The Steam entries Tender created");
    expect(ROM_FILES_DESCRIPTION).toContain("The ROMs Tender downloaded");
    expect(ROM_FILES_SIZE_NOTE).toContain("The size is what your RomM server reported");
    expect(GRID_IMAGES_DESCRIPTION).toContain("Steam keeps the images it shows");
    expect(NON_STEAM_DESCRIPTION).toContain("Everything in your Steam library");
    expect(REMOVED_GAMES_DESCRIPTION).toContain("Games whose entry is gone from your RomM server");
  });

  it("exports action labels and confirmation descriptions", () => {
    expect(REMOVE_ALL_SHORTCUTS_LABEL).toBe("Remove all shortcuts");
    expect(REMOVE_ALL_SHORTCUTS_CONFIRM_DESC).toContain("Remove every RomM shortcut?");
    expect(UNINSTALL_ALL_ROMS_LABEL).toBe("Uninstall all ROM files");
    expect(UNINSTALL_ALL_ROMS_CONFIRM_DESC).toContain("Delete every downloaded ROM file?");
    expect(REMOVE_GRID_IMAGES_TITLE).toBe("Remove orphaned images?");
    expect(REMOVE_NON_STEAM_TITLE).toBe("Remove non-Steam games?");
    expect(RETRODECK_DANGER_TITLE).toContain("RetroDECK");
    expect(RETRODECK_DANGER_DESC).toContain("permanently removed");
  });

  it("formats parameterized labels and descriptions", () => {
    expect(removeGridImagesLabel(1)).toBe("Remove 1 orphaned image");
    expect(removeGridImagesLabel(5)).toBe("Remove 5 orphaned images");

    expect(removeGridImagesConfirm(1)).toBe("Remove 1 image?");
    expect(removeGridImagesConfirm(3)).toBe("Remove 3 images?");

    expect(removeGridImagesConfirmDesc(4)).toContain("Remove 4 orphaned grid images?");

    expect(removeNonSteamLabel(1)).toBe("Remove 1 non-Steam game");
    expect(removeNonSteamLabel(3)).toBe("Remove 3 non-Steam games");

    expect(removeNonSteamConfirmDesc(3, 2)).toContain("Remove 3 non-Steam games (2 whitelisted)?");

    expect(recoveryBundlesDescription()).toContain("Nothing is ever read back automatically");
    expect(recoveryBundlesDescription("/home/deck/recovery")).toContain("in /home/deck/recovery");

    expect(RECOVERY_BUNDLES_EMPTY_NOTE).toContain("Nothing has been sealed");
    expect(RECOVERY_BUNDLES_PRESENT_NOTE).toContain("Each carries a README");
    expect(RECOVERY_TABLE_HEADINGS).toEqual(["Game", "Sealed", "Size"]);
  });
});
