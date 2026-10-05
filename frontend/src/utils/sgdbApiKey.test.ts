import { describe, it, expect, vi } from "vitest";
import {
  GENERIC_SAVE_KEY_ERROR,
  GENERIC_VERIFY_ERROR,
  SGDB_KEY_HELP,
  sgdbKeyComplete,
  verifyThenSaveSgdbKey,
} from "./sgdbApiKey";

describe("sgdbKeyComplete", () => {
  it("refuses whitespace alone", () => {
    expect(sgdbKeyComplete("  ")).toBe(false);
    expect(sgdbKeyComplete(" k ")).toBe(true);
  });
});

describe("verifyThenSaveSgdbKey", () => {
  it("saves a key that verified, and answers null", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const verify = vi.fn().mockResolvedValue({ success: true, message: "" });
    expect(await verifyThenSaveSgdbKey("k", { verify, save })).toBeNull();
    expect(verify).toHaveBeenCalledWith("k");
    expect(save).toHaveBeenCalledWith("k");
  });

  it("answers SteamGridDB's refusal and saves nothing", async () => {
    const save = vi.fn();
    const answer = await verifyThenSaveSgdbKey("k", {
      verify: () => Promise.resolve({ success: false, message: "Invalid key" }),
      save,
    });
    expect(answer).toBe("Invalid key");
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps a failed verify apart from a failed save", async () => {
    const save = vi.fn();
    expect(await verifyThenSaveSgdbKey("k", { verify: () => Promise.reject(new Error("x")), save })).toBe(
      GENERIC_VERIFY_ERROR,
    );
    expect(save).not.toHaveBeenCalled();
    expect(
      await verifyThenSaveSgdbKey("k", {
        verify: () => Promise.resolve({ success: true, message: "" }),
        save: () => Promise.reject(new Error("x")),
      }),
    ).toBe(GENERIC_SAVE_KEY_ERROR);
  });

  it("words the two failures and the help", () => {
    expect(GENERIC_VERIFY_ERROR).toBe("Could not verify the key. Check your connection and try again.");
    expect(GENERIC_SAVE_KEY_ERROR).toBe("The key is valid, but saving it failed. Check your connection and try again.");
    expect(SGDB_KEY_HELP).toBe(
      "Paste the key from your SteamGridDB profile (Preferences → API). It is checked against SteamGridDB before " +
        "it is saved.",
    );
  });
});
