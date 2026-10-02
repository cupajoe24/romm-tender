import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, screen } from "@testing-library/react";
import * as backend from "../api/backend";
import * as desktopWindow from "./desktopWindow";
import {
  LAUNCH_PROMPT_HOST_CLASS,
  askInDesktopWindow,
  offerDesktopLaunchPrompts,
  withdrawDesktopLaunchPrompts,
} from "./launchPromptHost";
import { launchPromptsForThisStart } from "../utils/launchPromptRouter";
import type { LaunchPrompts } from "../utils/launchVerdict";

vi.mock("../api/backend", async (importActual) => ({
  ...(await importActual<typeof import("../api/backend")>()),
  debugLog: vi.fn(() => Promise.resolve()),
}));

vi.mock("./desktopWindow", () => ({
  findDesktopWindow: vi.fn(),
  findReactClient: vi.fn(),
}));

// happy-dom has one realm, so the test's own window stands in for the desktop
// client's: what is pinned here is which window is drawn into and when the
// dialog goes, not that the cross-realm reads hold (device only).
const asTheDesktopWindow = (): void => {
  vi.mocked(desktopWindow.findDesktopWindow).mockReturnValue(window);
  vi.mocked(desktopWindow.findReactClient).mockReturnValue({ createRoot });
};

const hosts = (): Element[] => [...document.body.querySelectorAll(`.${LAUNCH_PROMPT_HOST_CLASS}`)];

const gamepad: LaunchPrompts = {
  confirmCoreChange: vi.fn(),
  resolveConflicts: vi.fn(),
  askOfflineDrift: vi.fn(),
  confirmFallbackLaunch: vi.fn(),
};

/** Ask a yes/no question whose dialog is a single "Yes" button. */
const askYes = (): Promise<string> =>
  askInDesktopWindow("dismissed", (resolve) => (
    <button type="button" onClick={() => resolve("yes")}>
      Yes
    </button>
  ));

const debugLines = (): string[] => vi.mocked(backend.debugLog).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  vi.mocked(backend.debugLog).mockClear();
  asTheDesktopWindow();
});

afterEach(() => {
  act(() => withdrawDesktopLaunchPrompts());
});

describe("askInDesktopWindow", () => {
  it("draws the dialog into the desktop window's body and takes it away once answered", async () => {
    let answer: Promise<string> | undefined;
    act(() => {
      answer = askYes();
    });

    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]?.parentElement).toBe(document.body);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    });

    await expect(answer).resolves.toBe("yes");
    expect(hosts()).toHaveLength(0);
  });

  it("settles with the dismissed answer and takes the dialog away when the window goes", async () => {
    let answer: Promise<string> | undefined;
    act(() => {
      answer = askYes();
    });
    expect(hosts()).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    await expect(answer).resolves.toBe("dismissed");
    expect(hosts()).toHaveLength(0);
  });

  it("stops listening for the window going once the question is answered", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    let answer: Promise<string> | undefined;
    act(() => {
      answer = askYes();
    });
    expect(removeSpy).not.toHaveBeenCalledWith("pagehide", expect.anything(), undefined);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    });
    await expect(answer).resolves.toBe("yes");

    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(["pagehide", "unload"]));
  });

  it("answers a closed window's question dismissed at once", async () => {
    vi.mocked(desktopWindow.findDesktopWindow).mockReturnValue({ closed: true } as Window);

    await expect(askYes()).resolves.toBe("dismissed");
    expect(debugLines()).toContain("Desktop launch prompt: nothing to draw into (window=closed, createRoot=found)");
  });

  it("answers dismissed at once when there is no desktop window", async () => {
    vi.mocked(desktopWindow.findDesktopWindow).mockReturnValue(undefined);

    await expect(askYes()).resolves.toBe("dismissed");
    expect(hosts()).toHaveLength(0);
    expect(debugLines()).toContain("Desktop launch prompt: nothing to draw into (window=none, createRoot=found)");
  });

  it("answers dismissed at once when React's createRoot cannot be found", async () => {
    vi.mocked(desktopWindow.findReactClient).mockReturnValue(undefined);

    await expect(askYes()).resolves.toBe("dismissed");
    expect(debugLines()).toContain("Desktop launch prompt: nothing to draw into (window=open, createRoot=missing)");
  });

  it("answers dismissed and leaves nothing behind when the root cannot be created", async () => {
    vi.mocked(desktopWindow.findReactClient).mockReturnValue({
      createRoot: () => {
        throw new Error("boom");
      },
    });

    await expect(askYes()).resolves.toBe("dismissed");
    expect(hosts()).toHaveLength(0);
    expect(debugLines()).toContain("Desktop launch prompt: could not draw the dialog: Error: boom");
  });

  it("dismisses a launch dialog on Escape, as the frame does on a game page", async () => {
    offerDesktopLaunchPrompts();
    vi.stubGlobal("SteamUIStore", { MainInstanceUIMode: 7, SetRunningApp: vi.fn() });
    const prompts = launchPromptsForThisStart(gamepad);
    expect(prompts).not.toBe(gamepad);

    let answer: Promise<"start_anyway" | "retry" | "cancel"> | undefined;
    act(() => {
      answer = prompts.askOfflineDrift();
    });
    expect(screen.getByRole("dialog", { name: "RomM Unreachable" })).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    await expect(answer).resolves.toBe("cancel");
    expect(hosts()).toHaveLength(0);
  });
});

describe("offering the desktop dialogs to the launch watcher", () => {
  beforeEach(() => {
    vi.stubGlobal("SteamUIStore", { MainInstanceUIMode: 7, SetRunningApp: vi.fn() });
  });

  it("offers them only while there is a desktop window to draw into", () => {
    offerDesktopLaunchPrompts();
    expect(launchPromptsForThisStart(gamepad)).not.toBe(gamepad);

    vi.mocked(desktopWindow.findDesktopWindow).mockReturnValue(undefined);
    expect(launchPromptsForThisStart(gamepad)).toBe(gamepad);
  });

  it("withdrawing them settles every open question with its dismissed answer and takes the dialogs away", async () => {
    offerDesktopLaunchPrompts();
    let first: Promise<string> | undefined;
    let second: Promise<string> | undefined;
    act(() => {
      first = askYes();
      second = askInDesktopWindow("no", () => <span>Second</span>);
    });
    expect(hosts()).toHaveLength(2);

    act(() => withdrawDesktopLaunchPrompts());

    await expect(first).resolves.toBe("dismissed");
    await expect(second).resolves.toBe("no");
    expect(hosts()).toHaveLength(0);
    expect(launchPromptsForThisStart(gamepad)).toBe(gamepad);
  });
});
