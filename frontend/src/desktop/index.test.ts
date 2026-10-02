import { describe, it, expect, vi, afterEach } from "vitest";
import * as desktopIndex from "./index";
import * as desktopWin from "./desktopWindow";
import { launchPromptsForThisStart } from "../utils/launchPromptRouter";
import type { LaunchPrompts } from "../utils/launchVerdict";

describe("desktop index exports", () => {
  it("exports the public desktop surface and components", () => {
    expect(typeof desktopIndex.startDesktopSurface).toBe("function");
    expect(typeof desktopIndex.stopDesktopSurface).toBe("function");
    expect(desktopIndex.appIdOf(null)).toBeNull();
    expect(typeof desktopIndex.findSteamOverviewPanel).toBe("function");
    expect(typeof desktopIndex.findDesktopWindow).toBe("function");
    expect(typeof desktopIndex.findReactClient).toBe("function");
    expect(desktopIndex.coverCandidates(-1)).toEqual([]);
    expect(desktopIndex.heroCandidates(-1)).toEqual([]);
    expect(typeof desktopIndex.GameView).toBe("function");
    expect(typeof desktopIndex.AboutHeader).toBe("function");
    expect(typeof desktopIndex.AboutDetails).toBe("function");
    expect(typeof desktopIndex.EmulationSettings).toBe("function");
    expect(desktopIndex.TENDER_SUBSTITUTE_ID).toBe("tender-desktop-substitute");
  });
});

describe("the launch watcher's prompts", () => {
  const gamepad = {} as LaunchPrompts;

  afterEach(() => {
    desktopIndex.stopDesktopSurface();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("are offered while the surface runs and withdrawn when it stops", () => {
    vi.stubGlobal("SteamUIStore", { MainInstanceUIMode: 7, SetRunningApp: vi.fn() });
    vi.spyOn(desktopWin, "findDesktopWindow").mockReturnValue(window);
    expect(launchPromptsForThisStart(gamepad)).toBe(gamepad);

    desktopIndex.startDesktopSurface();
    expect(launchPromptsForThisStart(gamepad)).not.toBe(gamepad);

    desktopIndex.stopDesktopSurface();
    expect(launchPromptsForThisStart(gamepad)).toBe(gamepad);
  });
});
