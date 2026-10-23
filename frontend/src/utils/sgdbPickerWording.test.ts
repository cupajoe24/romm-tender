import { describe, it, expect } from "vitest";
import {
  SGDB_PICKER_TITLE,
  SGDB_PICKER_EXPLANATION,
  SGDB_PICKER_FIELD_LABEL,
  SGDB_PICKER_SEARCH_BUTTON,
  SGDB_PICKER_CLOSE_BUTTON,
  SGDB_PICKER_NO_MATCHES,
  SGDB_PICKER_GENERIC_SEARCH_ERROR,
  SGDB_PICKER_RESULTS_NOTE,
  SGDB_PICKER_APPLY_FAILED,
  SGDB_PICKER_NO_PREVIEW,
} from "./sgdbPickerWording";

describe("sgdbPickerWording", () => {
  it("exports expected static labels and wording constants", () => {
    expect(SGDB_PICKER_TITLE).toBe("Choose SteamGridDB Game");
    expect(SGDB_PICKER_EXPLANATION).toBe(
      "No SteamGridDB match was found automatically — search by name and pick the right game.",
    );
    expect(SGDB_PICKER_FIELD_LABEL).toBe("Search SteamGridDB");
    expect(SGDB_PICKER_SEARCH_BUTTON).toBe("Search");
    expect(SGDB_PICKER_CLOSE_BUTTON).toBe("Close");
    expect(SGDB_PICKER_NO_MATCHES).toBe("No matches found.");
    expect(SGDB_PICKER_GENERIC_SEARCH_ERROR).toBe("Search failed. Check your connection and try again.");
    expect(SGDB_PICKER_RESULTS_NOTE).toBe(
      "Showing the top 6 matches — refine your search if the right game isn't here.",
    );
    expect(SGDB_PICKER_APPLY_FAILED).toBe("Failed to apply artwork selection");
    expect(SGDB_PICKER_NO_PREVIEW).toBe("No preview");
  });
});
