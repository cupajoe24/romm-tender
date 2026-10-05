// What this file pins is the desktop drawing of the Connections section: what
// each row shows from the shared state, that the URL saves only from its Save
// button, and that each dialog reaches the handler the QAM section's does. The
// handlers' own behaviour is pinned once, through the QAM page, in
// `bigpicture/SettingsPage.test.tsx`, and the flows behind the dialogs beside
// their modules in `utils/`.

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as backend from "../../../api/backend";
import type { PluginSettings } from "../../../types";
import { INVALID_URL_MESSAGE } from "../../../utils/rommSignIn";
import { ConnectionsTab } from "./ConnectionsTab";

const settings = (over: Partial<PluginSettings> = {}): PluginSettings => ({
  romm_url: "https://romm.local",
  has_token: false,
  steam_input_mode: "default",
  sgdb_api_key_masked: "",
  log_level: "warn",
  romm_allow_insecure_ssl: false,
  ...over,
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });

async function renderTab(over: Partial<PluginSettings> = {}) {
  vi.mocked(backend.getSettings).mockResolvedValue(settings(over));
  const result = render(<ConnectionsTab />);
  await flush();
  return result;
}

async function press(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
  await flush();
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const dialog = (name: string) => screen.getByRole("dialog", { name });
const urlField = () => screen.getByTestId("text-field") as HTMLInputElement;
const rowDescription = (label: string) =>
  screen
    .getAllByTestId("field")
    .find((row) => within(row).queryByTestId("field-label")?.textContent === label)
    ?.querySelector("[data-testid=field-desc]")?.textContent;

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function submit(form: HTMLElement) {
  await act(async () => {
    fireEvent.submit(form.querySelector("form") as HTMLFormElement);
    await Promise.resolve();
  });
  await flush();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(backend.getKnownRegions).mockResolvedValue([]);
  vi.mocked(backend.getSaveSyncSettings).mockResolvedValue({
    save_sync_enabled: false,
    sync_before_launch: true,
    sync_after_exit: true,
    default_slot: "default",
    autocleanup_limit: 10,
  });
});

describe("the RomM rows", () => {
  it("shows what is stored", async () => {
    await renderTab({ has_token: true, romm_custom_header_names: ["X-A", "X-B"] });

    expect(urlField().value).toBe("https://romm.local");
    expect(rowDescription("Custom headers")).toBe("2 set");
    expect(rowDescription("RomM Account")).toBe("Signed in");
    expect(button("Sign in again")).toBeInTheDocument();
  });

  it("offers Save only once the field differs from the stored URL, and saves only from it", async () => {
    vi.mocked(backend.saveServerUrl).mockResolvedValue({ success: true, message: "" });
    await renderTab();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    type(urlField(), "https://romm.local  ");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    type(urlField(), "  https://other.local ");
    expect(backend.saveServerUrl).not.toHaveBeenCalled();
    await press(button("Save"));

    expect(backend.saveServerUrl).toHaveBeenCalledWith("https://other.local", false);
    expect(urlField().value).toBe("https://other.local");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("refuses a URL that is not one, on the status line", async () => {
    await renderTab();
    type(urlField(), "romm.local");
    await press(button("Save"));

    expect(backend.saveServerUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(INVALID_URL_MESSAGE);
  });

  it("offers the insecure-SSL switch for an https URL only, and saves the URL with it", async () => {
    vi.mocked(backend.saveServerUrl).mockResolvedValue({ success: true, message: "" });
    await renderTab();
    fireEvent.click(screen.getByTestId("toggle-input"));
    expect(backend.saveServerUrl).toHaveBeenCalledWith("https://romm.local", true);
    expect(screen.getByTestId("toggle-desc")).toHaveTextContent("Only on a network you trust.");
  });

  it("has no insecure-SSL switch for an http URL", async () => {
    await renderTab({ romm_url: "http://romm.local" });
    expect(screen.queryByTestId("toggle")).toBeNull();
  });
});

describe("signing in", () => {
  it("opens on the pairing code and signs in with the code and the stored URL", async () => {
    vi.mocked(backend.connectWithPairingCode).mockResolvedValue({ success: true, message: "Signed in as me" });
    await renderTab();
    await press(button("Sign in"));

    const box = dialog("Sign in to RomM");
    expect(within(box).getByRole("button", { name: "Pairing code" })).toHaveAttribute("aria-pressed", "true");
    const submitButton = within(box).getByRole("button", { name: "Sign in" });
    expect(submitButton).toBeDisabled();
    const input = within(box).getByLabelText("Pairing code") as HTMLInputElement;
    type(input, "abcd 1234");
    expect(input.value).toBe("ABCD-1234");
    expect(submitButton).toBeEnabled();
    await submit(box);

    expect(backend.connectWithPairingCode).toHaveBeenCalledWith("https://romm.local", "ABCD1234", false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Signed in as me");
    expect(rowDescription("RomM Account")).toBe("Signed in");
  });

  it("keeps the dialog open on a refusal, with the backend's message", async () => {
    vi.mocked(backend.connectWithToken).mockResolvedValue({ success: false, message: "Sign-in rejected" });
    await renderTab();
    await press(button("Sign in"));
    const box = dialog("Sign in to RomM");
    await press(within(box).getByRole("button", { name: "API token" }));
    type(within(box).getByLabelText("API Token"), "tok");
    await submit(box);

    expect(backend.connectWithToken).toHaveBeenCalledWith("https://romm.local", "tok", false);
    expect(within(dialog("Sign in to RomM")).getByRole("alert")).toHaveTextContent("Sign-in rejected");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("signs in with a username and password", async () => {
    vi.mocked(backend.connectWithCredentials).mockResolvedValue({ success: true, message: "ok" });
    await renderTab();
    await press(button("Sign in"));
    const box = dialog("Sign in to RomM");
    await press(within(box).getByRole("button", { name: "Username & password" }));
    type(within(box).getByLabelText("Username"), "me");
    type(within(box).getByLabelText("Password"), "pw");
    await submit(box);

    expect(backend.connectWithCredentials).toHaveBeenCalledWith("https://romm.local", "me", "pw", false);
  });

  it("closes without signing in on Cancel", async () => {
    await renderTab();
    await press(button("Sign in"));
    await press(within(dialog("Sign in to RomM")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("signing out", () => {
  it("asks first, and signs out only on yes", async () => {
    vi.mocked(backend.signOut).mockResolvedValue({ success: true, message: "Signed out" });
    await renderTab({ has_token: true });

    await press(button("Sign out"));
    await press(within(dialog("Sign out of RomM?")).getByRole("button", { name: "Cancel" }));
    expect(backend.signOut).not.toHaveBeenCalled();

    await press(button("Sign out"));
    await press(within(dialog("Sign out of RomM?")).getByRole("button", { name: "Sign out" }));
    expect(backend.signOut).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Signed out");
    expect(rowDescription("RomM Account")).toBe("Not signed in");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("is not offered without a token", async () => {
    await renderTab();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});

describe("custom headers", () => {
  const openEditor = async () => {
    await press(screen.getAllByRole("button", { name: "Edit" })[0] as HTMLElement);
    return dialog("Custom headers");
  };

  it("keeps a stored value it was not given, and counts what was accepted", async () => {
    vi.mocked(backend.saveCustomHeaders).mockResolvedValue({ success: true, message: "" });
    await renderTab({ romm_custom_header_names: ["X-A"] });
    const box = await openEditor();
    expect(within(box).getByText("stored — leave blank to keep it")).toBeInTheDocument();

    await press(within(box).getByRole("button", { name: "Add header" }));
    const names = within(box).getAllByLabelText("Header name");
    const values = within(box).getAllByLabelText("Value");
    type(names[1] as HTMLElement, " X-B ");
    type(values[1] as HTMLElement, "secret");
    await submit(box);

    expect(backend.saveCustomHeaders).toHaveBeenCalledWith([
      { name: "X-A", value_action: "keep" },
      { name: " X-B ", value_action: "set", value: "secret" },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rowDescription("Custom headers")).toBe("2 set");
  });

  it("keeps the editor open on a refusal, and a removed row is not sent", async () => {
    vi.mocked(backend.saveCustomHeaders).mockResolvedValue({ success: false, message: "Reserved name" });
    await renderTab({ romm_custom_header_names: ["X-A"] });
    const box = await openEditor();
    await press(within(box).getByRole("button", { name: "Remove" }));
    expect(within(box).getByText("No custom headers.")).toBeInTheDocument();
    await submit(box);

    expect(backend.saveCustomHeaders).toHaveBeenCalledWith([]);
    expect(within(dialog("Custom headers")).getByRole("alert")).toHaveTextContent("Reserved name");
    expect(rowDescription("Custom headers")).toBe("1 set");
  });
});

describe("the SteamGridDB key", () => {
  const openKey = async () => {
    await press(screen.getAllByRole("button", { name: "Edit" })[1] as HTMLElement);
    return dialog("SteamGridDB API Key");
  };

  it("saves a key only once SteamGridDB accepts it, then shows it masked", async () => {
    vi.mocked(backend.verifySgdbApiKey).mockResolvedValue({ success: true, message: "" });
    vi.mocked(backend.saveSgdbApiKey).mockResolvedValue({ success: true, message: "" });
    await renderTab();
    expect(rowDescription("API Key")).toBe("Not configured");
    const box = await openKey();
    type(within(box).getByLabelText("API Key"), "k");
    await submit(box);

    expect(backend.verifySgdbApiKey).toHaveBeenCalledWith("k");
    expect(backend.saveSgdbApiKey).toHaveBeenCalledWith("k");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rowDescription("API Key")).toBe("••••");
  });

  it("keeps the prompt open on a rejected key and saves nothing", async () => {
    vi.mocked(backend.verifySgdbApiKey).mockResolvedValue({ success: false, message: "Invalid key" });
    await renderTab();
    const box = await openKey();
    expect(within(box).getByRole("button", { name: "Save" })).toBeDisabled();
    type(within(box).getByLabelText("API Key"), "bad");
    await submit(box);

    expect(backend.saveSgdbApiKey).not.toHaveBeenCalled();
    expect(within(dialog("SteamGridDB API Key")).getByRole("alert")).toHaveTextContent("Invalid key");
  });
});
