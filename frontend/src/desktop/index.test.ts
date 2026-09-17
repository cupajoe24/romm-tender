import { describe, it, expect } from "vitest";
import * as desktopIndex from "./index";

describe("desktop index exports", () => {
  it("exports the public desktop navigation watcher and components", () => {
    expect(typeof desktopIndex.startDesktopNavigationWatcher).toBe("function");
    expect(typeof desktopIndex.stopDesktopNavigationWatcher).toBe("function");
    expect(desktopIndex.appIdOf(null)).toBeNull();
    expect(typeof desktopIndex.findSteamOverviewPanel).toBe("function");
    expect(typeof desktopIndex.findDesktopWindow).toBe("function");
    expect(typeof desktopIndex.findReactClient).toBe("function");
    expect(desktopIndex.coverCandidates(-1)).toEqual([]);
    expect(typeof desktopIndex.GameView).toBe("function");
    expect(desktopIndex.GameViewPage).toBe(desktopIndex.GameView);
    expect(typeof desktopIndex.GameViewTabBar).toBe("function");
    expect(typeof desktopIndex.AboutHeader).toBe("function");
    expect(typeof desktopIndex.AboutDetails).toBe("function");
    expect(typeof desktopIndex.EmulationSettings).toBe("function");
    expect(desktopIndex.formatReleaseDate(null)).toBeNull();
    expect(desktopIndex.TENDER_SUBSTITUTE_ID).toBe("tender-desktop-substitute");
  });
});
