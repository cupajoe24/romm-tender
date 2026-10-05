import { describe, it, expect, vi } from "vitest";
import {
  GENERIC_SAVE_HEADERS_ERROR,
  STORED_VALUE_HINT,
  STORED_VALUE_PLACEHOLDER,
  keepsStoredValue,
  rowsFromStoredNames,
  saveHeaderRows,
  toEntries,
  type HeaderRow,
} from "./customHeaders";

const stored = (name: string, over: Partial<HeaderRow> = {}): HeaderRow => ({
  id: 0,
  name,
  value: "",
  storedName: name,
  ...over,
});

describe("rowsFromStoredNames", () => {
  it("makes one row per stored name, in order, each with an empty value", () => {
    expect(rowsFromStoredNames(["A", "B"])).toEqual([
      { id: 0, name: "A", value: "", storedName: "A" },
      { id: 1, name: "B", value: "", storedName: "B" },
    ]);
  });
});

describe("keepsStoredValue", () => {
  it("keeps a stored row under its own name with an untouched value", () => {
    expect(keepsStoredValue(stored("X-Token"))).toBe(true);
  });

  it("does not keep a renamed row, a typed value, or a new row", () => {
    expect(keepsStoredValue(stored("X-Token", { name: "X-Other" }))).toBe(false);
    expect(keepsStoredValue(stored("X-Token", { value: "v" }))).toBe(false);
    expect(keepsStoredValue({ id: 1, name: "", value: "", storedName: null })).toBe(false);
  });
});

describe("toEntries", () => {
  it("sends keep for a kept row and set with the value for every other", () => {
    expect(
      toEntries([stored("A"), stored("B", { value: "new" }), { id: 2, name: "C", value: "c", storedName: null }]),
    ).toEqual([
      { name: "A", value_action: "keep" },
      { name: "B", value_action: "set", value: "new" },
      { name: "C", value_action: "set", value: "c" },
    ]);
  });
});

describe("saveHeaderRows", () => {
  it("answers null once the list is accepted, having sent its entries", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    expect(await saveHeaderRows([stored("A")], onSave)).toBeNull();
    expect(onSave).toHaveBeenCalledWith([{ name: "A", value_action: "keep" }]);
  });

  it("answers the backend's refusal, or the generic one where it gave none", async () => {
    expect(await saveHeaderRows([], () => Promise.resolve({ success: false, message: "Reserved name" }))).toBe(
      "Reserved name",
    );
    expect(await saveHeaderRows([], () => Promise.resolve({ success: false }))).toBe(GENERIC_SAVE_HEADERS_ERROR);
  });

  it("answers the generic failure for a rejection", async () => {
    expect(await saveHeaderRows([], () => Promise.reject(new Error("x")))).toBe(GENERIC_SAVE_HEADERS_ERROR);
  });
});

describe("the words", () => {
  it("says a stored value is kept unless replaced", () => {
    expect(STORED_VALUE_HINT).toBe("stored — leave blank to keep it");
    expect(STORED_VALUE_PLACEHOLDER).toBe("••••");
    expect(GENERIC_SAVE_HEADERS_ERROR).toBe("Could not save the headers. Check your connection and try again.");
  });
});
