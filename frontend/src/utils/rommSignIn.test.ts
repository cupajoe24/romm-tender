import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as backend from "../api/backend";
import {
  DEFAULT_SIGN_IN_MODE,
  GENERIC_SIGN_IN_ERROR,
  INVALID_URL_MESSAGE,
  PAIRING_CODE_GROUP,
  PAIRING_CODE_LENGTH,
  SIGN_IN_HELP,
  SIGN_IN_MODE_OPTIONS,
  SIGN_IN_TIMEOUT_ERROR,
  SIGN_IN_TIMEOUT_MS,
  normalizePairingCode,
  signInComplete,
  signInRequest,
  signInToRomm,
  submitSignIn,
  type SignInFields,
} from "./rommSignIn";
import { phraseText } from "./settingsWording";

const fields = (over: Partial<SignInFields> = {}): SignInFields => ({
  username: "",
  password: "",
  token: "",
  code: "",
  ...over,
});

describe("the modes", () => {
  it("opens on the pairing code and offers the three ways in that order", () => {
    expect(DEFAULT_SIGN_IN_MODE).toBe("pairing");
    expect(SIGN_IN_MODE_OPTIONS).toEqual([
      { mode: "pairing", label: "Pairing code" },
      { mode: "token", label: "API token" },
      { mode: "credentials", label: "Username & password" },
    ]);
  });

  it("says what each mode asks for, with Pair emphasised", () => {
    expect(phraseText(SIGN_IN_HELP.pairing)).toBe(
      "In RomM's web UI open your API token and click Pair, then enter the 8-character code here within 60 " +
        "seconds. The plugin fetches the token itself — nothing to copy or paste.",
    );
    expect(SIGN_IN_HELP.pairing.filter((run) => run.strong).map((run) => run.text)).toEqual(["Pair"]);
    expect(phraseText(SIGN_IN_HELP.token)).toContain("(Settings → API Tokens)");
    expect(phraseText(SIGN_IN_HELP.credentials)).toContain("never stores your password");
  });

  it("splits an eight-character pairing code four and four", () => {
    expect(PAIRING_CODE_LENGTH).toBe(8);
    expect(PAIRING_CODE_GROUP).toBe(4);
  });
});

describe("normalizePairingCode", () => {
  it("keeps letters and digits, uppercased, and drops everything else", () => {
    expect(normalizePairingCode(" ab-cd 12.34 ")).toBe("ABCD1234");
  });
});

describe("signInComplete", () => {
  it("needs a username and an untrimmed password", () => {
    expect(signInComplete("credentials", fields({ username: "  ", password: "x" }))).toBe(false);
    expect(signInComplete("credentials", fields({ username: "me", password: "" }))).toBe(false);
    expect(signInComplete("credentials", fields({ username: "me", password: " " }))).toBe(true);
  });

  it("needs a token that is not whitespace", () => {
    expect(signInComplete("token", fields({ token: "   " }))).toBe(false);
    expect(signInComplete("token", fields({ token: "t" }))).toBe(true);
  });

  it("needs all eight characters of the code, in any spelling", () => {
    expect(signInComplete("pairing", fields({ code: "ABCD-123" }))).toBe(false);
    expect(signInComplete("pairing", fields({ code: "abcd-1234" }))).toBe(true);
  });
});

describe("signInRequest", () => {
  const all = fields({ username: "me", password: "pw", token: "tok", code: "abcd-1234" });

  it("sends only what the mode asks for", () => {
    expect(signInRequest("credentials", all)).toEqual({ mode: "credentials", username: "me", password: "pw" });
    expect(signInRequest("token", all)).toEqual({ mode: "token", token: "tok" });
    expect(signInRequest("pairing", all)).toEqual({ mode: "pairing", code: "abcd-1234" });
  });
});

describe("signInToRomm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("refuses a URL that is not one before calling anything", async () => {
    const result = await signInToRomm("romm.local", false, { mode: "token", token: "t" });
    expect(result).toEqual({ success: false, message: INVALID_URL_MESSAGE });
    expect(backend.connectWithToken).not.toHaveBeenCalled();
  });

  it("calls each mode's endpoint with the trimmed URL and the SSL choice", async () => {
    vi.mocked(backend.connectWithCredentials).mockResolvedValue({ success: true, message: "a" });
    vi.mocked(backend.connectWithToken).mockResolvedValue({ success: true, message: "b" });
    vi.mocked(backend.connectWithPairingCode).mockResolvedValue({ success: false, message: "c" });

    expect(await signInToRomm(" https://r ", true, { mode: "credentials", username: "u", password: "p" })).toEqual({
      success: true,
      message: "a",
    });
    expect(backend.connectWithCredentials).toHaveBeenCalledWith("https://r", "u", "p", true);
    expect(await signInToRomm("https://r", false, { mode: "token", token: "t" })).toEqual({
      success: true,
      message: "b",
    });
    expect(backend.connectWithToken).toHaveBeenCalledWith("https://r", "t", false);
    expect(await signInToRomm("https://r", false, { mode: "pairing", code: "c" })).toEqual({
      success: false,
      message: "c",
    });
    expect(backend.connectWithPairingCode).toHaveBeenCalledWith("https://r", "c", false);
  });

  it("answers the generic failure for a call that throws", async () => {
    vi.mocked(backend.connectWithToken).mockRejectedValue(new Error("socket"));
    expect(await signInToRomm("https://r", false, { mode: "token", token: "t" })).toEqual({
      success: false,
      message: GENERIC_SIGN_IN_ERROR,
    });
  });
});

describe("submitSignIn", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers null for a sign-in that succeeded", async () => {
    expect(await submitSignIn(() => Promise.resolve({ success: true, message: "ok" }))).toBeNull();
  });

  it("answers the backend's own refusal", async () => {
    expect(await submitSignIn(() => Promise.resolve({ success: false, message: "Sign-in rejected" }))).toBe(
      "Sign-in rejected",
    );
  });

  it("answers the generic failure for a rejection", async () => {
    expect(await submitSignIn(() => Promise.reject(new Error("x")))).toBe(GENERIC_SIGN_IN_ERROR);
  });

  it("answers the deadline's message once a minute passes unanswered", async () => {
    vi.useFakeTimers();
    const answer = submitSignIn(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(SIGN_IN_TIMEOUT_MS);
    expect(await answer).toBe(SIGN_IN_TIMEOUT_ERROR);
    expect(SIGN_IN_TIMEOUT_MS).toBe(60_000);
  });
});
