import { describe, it, expect } from "vitest";
import {
  EDIT_LABEL,
  ENABLE_SAVE_SYNC_CONFIRM,
  SAVE_LABEL,
  INSECURE_SSL_DESCRIPTION,
  INSECURE_SSL_LABEL,
  SIGN_OUT_CONFIRM,
  SIGN_OUT_DESCRIPTION,
  accountState,
  customHeadersSummary,
  phraseText,
  sgdbKeyState,
  signInButtonLabel,
} from "./settingsWording";

describe("phraseText", () => {
  it("joins a phrase's runs without their emphasis", () => {
    expect(phraseText([{ text: "a " }, { text: "b", strong: true }, { text: "." }])).toBe("a b.");
  });
});

describe("Save Sync", () => {
  it("asks before turning save sync on, and says what it covers and what to do first", () => {
    expect(ENABLE_SAVE_SYNC_CONFIRM.title).toBe("Enable Save Sync?");
    expect(ENABLE_SAVE_SYNC_CONFIRM.confirm).toBe("I am sure");
    expect(ENABLE_SAVE_SYNC_CONFIRM.cancel).toBe("Cancel");
    const paragraphs = ENABLE_SAVE_SYNC_CONFIRM.description.split("\n\n");
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[0]).toContain("see the save sync support matrix in the docs");
    expect(paragraphs[1]).toContain("please back up your local save files");
    expect(paragraphs[2]).toContain("Save sync follows RetroArch's own save sorting");
    expect(paragraphs[3]).toContain("Save sync is intended for single user accounts.");
    expect(paragraphs[4]).toBe("Are you sure you want to proceed?");
  });
});

describe("Connections", () => {
  it("labels the row buttons", () => {
    expect([EDIT_LABEL, SAVE_LABEL]).toEqual(["Edit", "Save"]);
  });

  it("counts the custom headers, or says there are none", () => {
    expect(customHeadersSummary(0)).toBe("(none)");
    expect(customHeadersSummary(2)).toBe("2 set");
  });

  it("says whether this device holds a token, and offers to sign in again when it does", () => {
    expect(accountState(true)).toBe("Signed in");
    expect(accountState(false)).toBe("Not signed in");
    expect(signInButtonLabel(true)).toBe("Sign in again");
    expect(signInButtonLabel(false)).toBe("Sign in");
  });

  it("says sign-out forgets the token here and leaves it valid in RomM", () => {
    expect(SIGN_OUT_DESCRIPTION).toBe("Forgets the RomM token on this device. The token stays valid in RomM.");
    expect(SIGN_OUT_CONFIRM).toEqual({
      title: "Sign out of RomM?",
      description:
        "This only forgets the RomM token on this device. The token itself stays valid in RomM — revoke it there " +
        "(Settings → API Tokens) if you no longer want it.",
      confirm: "Sign out",
      cancel: "Cancel",
    });
  });

  it("warns what insecure SSL exposes, word for word", () => {
    expect(INSECURE_SSL_LABEL).toBe("Allow Insecure SSL");
    expect(INSECURE_SSL_DESCRIPTION).toBe(
      "Skip certificate checks for a self-signed server. Anyone who can intercept the connection can read what the " +
        "plugin sends — your RomM token, your password when you sign in with it, and any custom headers — and use " +
        "your account. Only on a network you trust.",
    );
  });

  it("masks a configured SteamGridDB key", () => {
    expect(sgdbKeyState("abc")).toBe("••••");
    expect(sgdbKeyState("")).toBe("Not configured");
  });
});
