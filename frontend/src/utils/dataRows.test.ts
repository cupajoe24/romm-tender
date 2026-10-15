import { describe, expect, it } from "vitest";
import { DATA_ROWS, asDataRowId } from "./dataRows";

describe("dataRows", () => {
  it("defines the six expected inventory populations in order", () => {
    expect(DATA_ROWS.map((r) => r.id)).toEqual([
      "shortcuts",
      "rom-files",
      "grid-images",
      "non-steam",
      "removed-games",
      "recovery-bundles",
    ]);
  });

  it("resolves valid ids to themselves", () => {
    expect(asDataRowId("shortcuts")).toBe("shortcuts");
    expect(asDataRowId("rom-files")).toBe("rom-files");
    expect(asDataRowId("grid-images")).toBe("grid-images");
    expect(asDataRowId("non-steam")).toBe("non-steam");
    expect(asDataRowId("removed-games")).toBe("removed-games");
    expect(asDataRowId("recovery-bundles")).toBe("recovery-bundles");
  });

  it("falls back to the first row for null or unknown ids", () => {
    expect(asDataRowId(null)).toBe("shortcuts");
    expect(asDataRowId("unknown")).toBe("shortcuts");
  });
});
