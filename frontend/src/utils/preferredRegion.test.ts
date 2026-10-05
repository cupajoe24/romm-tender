import { describe, it, expect } from "vitest";
import {
  AUTO_REGION,
  DEFAULT_REGION_LABEL,
  PREFERRED_REGION_CONFIRM,
  buildRegionOptions,
  regionChangeLine,
  regionLabel,
} from "./preferredRegion";
import { phraseText } from "./settingsWording";

describe("buildRegionOptions", () => {
  it("lists the Default sentinel + fixed anchors first, in build-time order", () => {
    const opts = buildRegionOptions([], AUTO_REGION);
    expect(opts.map((o) => o.data)).toEqual([AUTO_REGION, "World", "USA", "Europe", "Japan"]);
    expect(opts[0]?.label).toBe(DEFAULT_REGION_LABEL);
    expect(opts[0]?.label).not.toMatch(/auto/i);
  });

  it("appends distinct library regions after the anchors, sorted, de-duped against anchors", () => {
    const opts = buildRegionOptions(["Korea", "Brazil", "USA", "Korea"], AUTO_REGION);
    // "USA" is an anchor → not duplicated; "Korea"/"Brazil" appended sorted.
    expect(opts.map((o) => o.data)).toEqual([AUTO_REGION, "World", "USA", "Europe", "Japan", "Brazil", "Korea"]);
  });

  it("empty library → anchors only", () => {
    expect(buildRegionOptions([], AUTO_REGION).map((o) => o.data)).toEqual([
      AUTO_REGION,
      "World",
      "USA",
      "Europe",
      "Japan",
    ]);
  });

  it("always includes the current selection even if absent from anchors + library", () => {
    const opts = buildRegionOptions([], "Germany");
    expect(opts.map((o) => o.data)).toContain("Germany");
  });

  it("ignores empty/blank library region strings", () => {
    const opts = buildRegionOptions(["", "Brazil"], AUTO_REGION);
    expect(opts.map((o) => o.data)).toEqual([AUTO_REGION, "World", "USA", "Europe", "Japan", "Brazil"]);
  });
});

describe("regionLabel", () => {
  it("names the sentinel by the order it stands for, and any other region as itself", () => {
    expect(regionLabel(AUTO_REGION)).toBe("Default (World > USA > Europe)");
    expect(regionLabel("Japan")).toBe("Japan");
  });
});

describe("PREFERRED_REGION_CONFIRM", () => {
  it("says the change reaches only games synced from now on", () => {
    expect(PREFERRED_REGION_CONFIRM.title).toBe("Change Preferred Region");
    expect(regionChangeLine("USA", "Japan")).toBe("USA → Japan");
    expect(PREFERRED_REGION_CONFIRM.paragraphs.map(phraseText)).toEqual([
      "This applies to games synced from now on. When a game has several regional versions, the plugin will " +
        "prefer this region for the version it binds and the name it gives the new Steam shortcut.",
      "Games you have already synced keep their current version and shortcut name — changing this never switches " +
        "a game's version or renames an existing shortcut. Run a sync to apply it to new games.",
    ]);
    expect(
      PREFERRED_REGION_CONFIRM.paragraphs
        .flat()
        .filter((run) => run.strong)
        .map((run) => run.text),
    ).toEqual(["from now on", "already synced keep their current version and shortcut name"]);
    expect([PREFERRED_REGION_CONFIRM.confirm, PREFERRED_REGION_CONFIRM.cancel]).toEqual(["Save", "Cancel"]);
  });
});
