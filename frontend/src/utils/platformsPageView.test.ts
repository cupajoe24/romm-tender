// The QAM's Platforms tab pins what the marks, the clause and the buttons look
// like (`bigpicture/library/PlatformsTab.test.tsx`). What this file pins is the
// shape both surfaces draw from: each answer's TONE, which a surface maps to
// its own palette, and the smaller answers no colour reaches.

import { describe, it, expect } from "vitest";
import type { EmulatorOption, SystemCoreInfo } from "../types";
import {
  biosAbsence,
  biosLegend,
  biosRowAction,
  coreClause,
  diskMark,
  libraryMark,
  type FirmwareRow,
} from "./platformsPageView";
import type { PlatformRow } from "./usePlatformsPage";

const file = (over: Partial<FirmwareRow>): FirmwareRow =>
  ({
    file_name: "bios.bin",
    downloaded: false,
    required_by_active: false,
    wanted: "required",
    on_server: true,
    ...over,
  }) as FirmwareRow;

const option = (over: Partial<EmulatorOption>): EmulatorOption => ({
  label: "Core",
  labels: ["Core"],
  name: "Core",
  kind: "libretro",
  core_so: "core.so",
  emulator: "core",
  is_default: false,
  bakeable: true,
  reason: null,
  ...over,
});

const core = (over: Partial<SystemCoreInfo>): SystemCoreInfo => ({
  emulators: [option({ label: "A", is_default: true }), option({ label: "B" })],
  emulator_data_available: true,
  emulator_data_reason: null,
  emulator_source: null,
  platform_system: null,
  active_core_label: "A",
  ...over,
});

describe("diskMark", () => {
  it("answers the verdict in the glyph and the need in the tone", () => {
    expect(diskMark(file({ satisfied: true, required_by_active: true }))).toMatchObject({ glyph: "✓", tone: "good" });
    expect(diskMark(file({ satisfied: false, required_by_active: true }))).toMatchObject({ glyph: "✗", tone: "bad" });
    expect(diskMark(file({ satisfied: true }))).toMatchObject({ glyph: "✓", tone: "fine" });
    expect(diskMark(file({ satisfied: false }))).toMatchObject({ glyph: "✗", tone: "quiet" });
    expect(diskMark(file({ satisfied: true, wanted: "unknown" }))).toMatchObject({ glyph: "✓", tone: "unsure" });
    expect(diskMark(file({ declared_kind: "directory", downloaded: true }))).toMatchObject({
      glyph: "?",
      tone: "unsure",
    });
  });
});

describe("biosLegend", () => {
  it("lists only the marks the table holds, wrong first, and the library's last", () => {
    const legend = biosLegend([
      file({ satisfied: true }),
      file({ satisfied: false, required_by_active: true, on_server: false }),
    ]);
    expect(legend.map((entry) => [entry.glyph, entry.tone])).toEqual([
      ["✗", "bad"],
      ["✓", "fine"],
      ["⊘", "library"],
    ]);
  });

  it("is empty for no rows", () => {
    expect(biosLegend([])).toEqual([]);
  });
});

describe("libraryMark", () => {
  it("marks a file the library does not hold, and never a folder", () => {
    expect(libraryMark(file({ on_server: false }))?.tone).toBe("library");
    expect(libraryMark(file({ on_server: false, declared_kind: "directory" }))).toBeNull();
    expect(libraryMark(file({}))).toBeNull();
  });
});

describe("biosRowAction", () => {
  it("offers Download for a fetchable row unless the server is offline, then the delete if any", () => {
    const fetchable = new Set(["bios.bin"]);
    expect(biosRowAction(file({}), fetchable, false)).toEqual({ kind: "download", name: "bios.bin", firmwareId: null });
    expect(biosRowAction(file({ deletable_count: 1 }), fetchable, true)).toEqual({ kind: "delete", name: "bios.bin" });
    expect(biosRowAction(file({}), new Set(), false)).toBeNull();
  });

  it("downloads by the row's download name, with the library file's id where one fills it", () => {
    const library = { firmware_id: 7, file_name: "scph5501.bin" } as unknown as NonNullable<FirmwareRow["library"]>;
    const row = file({ file_name: "bios.bin", library });
    expect(biosRowAction(row, new Set(["bios.bin"]), false)).toEqual({
      kind: "download",
      name: "scph5501.bin",
      firmwareId: 7,
    });
  });

  it("offers Replace… where the backend does and the row has a place, ahead of a delete", () => {
    expect(
      biosRowAction(
        file({ replace_offered: true, local_path: "/bios/bios.bin", deletable_count: 1 }),
        new Set(),
        false,
      ),
    ).toEqual({ kind: "replace", place: "/bios/bios.bin" });
    expect(biosRowAction(file({ replace_offered: true, deletable_count: 1 }), new Set(), false)).toEqual({
      kind: "delete",
      name: "bios.bin",
    });
  });

  it("deletes by delete_name, and offers no delete where it is null or nothing is deletable", () => {
    expect(biosRowAction(file({ delete_name: "store.bin", deletable_count: 1 }), new Set(), false)).toEqual({
      kind: "delete",
      name: "store.bin",
    });
    expect(biosRowAction(file({ delete_name: null, deletable_count: 1 }), new Set(), false)).toBeNull();
    expect(biosRowAction(file({ delete_name: "store.bin", deletable_count: 0 }), new Set(), false)).toBeNull();
  });
});

describe("coreClause", () => {
  it("names the default plainly and an override as one", () => {
    expect(coreClause(core({}))).toEqual({ clause: "A", tone: "plain" });
    expect(coreClause(core({ active_core_label: "B" }))).toEqual({ clause: "B", tone: "override" });
  });

  it("calls a platform that cannot be pinned unpinnable", () => {
    expect(coreClause(core({ emulators: [], active_core_label: null }))).toEqual({
      clause: "no emulator",
      tone: "unpinnable",
    });
    expect(
      coreClause(core({ emulators: [option({ label: "X", reason: "not_installed" })], active_core_label: null })),
    ).toEqual({ clause: "no emulator installed", tone: "unpinnable" });
    expect(
      coreClause(core({ emulators: [option({ label: "X", reason: "quoting" })], active_core_label: null })),
    ).toEqual({ clause: "RetroDECK decides", tone: "plain" });
  });

  it("says nothing while the list is unread, failed or absent", () => {
    expect(coreClause(undefined).clause).toBeNull();
    expect(coreClause(null).clause).toBeNull();
    expect(coreClause(core({ emulator_data_available: false, emulators: [] })).clause).toBeNull();
  });
});

describe("biosAbsence", () => {
  const row = (over: Partial<PlatformRow>): PlatformRow => ({ firmware: null, ...over }) as PlatformRow;

  it("names which of the two ways a platform has no rows, and none where it has an answer", () => {
    expect(biosAbsence(row({ firmwareState: "pending" }))).toBe("pending");
    expect(biosAbsence(row({ firmwareState: "failed" }))).toBe("failed");
    expect(biosAbsence(row({ firmwareState: "answered" }))).toBeNull();
  });
});
