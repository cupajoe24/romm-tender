import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  appIdOf,
  findSteamOverviewPanel,
  findSteamPlaySection,
  findSteamContentSections,
  startDesktopNavigationWatcher,
  stopDesktopNavigationWatcher,
  TENDER_SUBSTITUTE_ID,
} from "./navigationWatcher";
import * as rommAppIds from "../utils/rommAppIds";
import * as desktopWin from "./desktopWindow";
import * as deckyUiInternals from "../utils/deckyUiInternals";

describe("navigationWatcher", () => {
  const originalManager = (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager;

  beforeEach(() => {
    stopDesktopNavigationWatcher();
    vi.mocked(rommAppIds.isRomMAppId);
  });

  afterEach(() => {
    stopDesktopNavigationWatcher();
    (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = originalManager;
    vi.restoreAllMocks();
  });

  describe("appIdOf", () => {
    it("returns null for empty or invalid paths", () => {
      expect(appIdOf(null)).toBeNull();
      expect(appIdOf(undefined)).toBeNull();
      expect(appIdOf("")).toBeNull();
      expect(appIdOf("/store")).toBeNull();
      expect(appIdOf("/library/home")).toBeNull();
    });

    it("extracts appId correctly from library routes", () => {
      expect(appIdOf("/library/app/12345")).toBe(12345);
      expect(appIdOf("/library/app/98765/achievements")).toBe(98765);
    });
  });

  describe("findSteamOverviewPanel", () => {
    it("finds panel using exact class from appDetailsClasses", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const panel = doc.createElement("div");
      panel.className = deckyUiInternals.appDetailsClasses?.AppDetailsOverviewPanel || "AppDetailsOverviewPanel";
      doc.body.appendChild(panel);

      expect(findSteamOverviewPanel(doc)).toBe(panel);
    });

    it("falls back to substring class match when webpack class is hashed", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const panel = doc.createElement("div");
      panel.className = "appdetailsoverview_AppDetailsOverviewPanel_3xK9 custom-other";
      doc.body.appendChild(panel);

      expect(findSteamOverviewPanel(doc)).toBe(panel);
    });

    it("ignores our own substitute container even if classes match", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const sub = doc.createElement("div");
      sub.id = TENDER_SUBSTITUTE_ID;
      sub.className = "AppDetailsOverviewPanel";
      doc.body.appendChild(sub);

      expect(findSteamOverviewPanel(doc)).toBeNull();
    });
  });

  describe("findSteamPlaySection", () => {
    it("finds play section using exact class from basicAppDetailsSectionStylerClasses", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const ps = doc.createElement("div");
      ps.className = deckyUiInternals.basicAppDetailsSectionStylerClasses?.PlaySection || "PlaySection";
      doc.body.appendChild(ps);

      expect(findSteamPlaySection(doc)).toBe(ps);
    });

    it("finds play section using PlayBar class from appDetailsClasses", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const pb = doc.createElement("div");
      pb.className = deckyUiInternals.appDetailsClasses?.PlayBar || "PlayBar";
      doc.body.appendChild(pb);

      expect(findSteamPlaySection(doc)).toBe(pb);
    });

    it("falls back to substring class match for PlaySection", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const ps = doc.createElement("div");
      ps.className = "custom_PlaySection_1234 other-class";
      doc.body.appendChild(ps);

      expect(findSteamPlaySection(doc)).toBe(ps);
    });

    it("falls back to play button ancestor when no section class matches", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const actionContainer = doc.createElement("div");
      actionContainer.className = "action-row";
      const btn = doc.createElement("button");
      btn.className = "AppActionButton PlayButton";
      actionContainer.appendChild(btn);
      doc.body.appendChild(actionContainer);

      expect(findSteamPlaySection(doc)).toBe(actionContainer);
    });
  });

  describe("findSteamContentSections", () => {
    it("returns overviewPanel itself when playSection is outside it", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playSection = doc.createElement("div");
      const overviewPanel = doc.createElement("div");
      doc.body.appendChild(playSection);
      doc.body.appendChild(overviewPanel);

      const sections = findSteamContentSections(overviewPanel, playSection);
      expect(sections).toEqual([overviewPanel]);
    });

    it("finds section list inside overviewPanel", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const overviewPanel = doc.createElement("div");
      const playSection = doc.createElement("div");
      playSection.className = "PlaySection";
      const sectionList = doc.createElement("div");
      sectionList.className =
        deckyUiInternals.basicAppDetailsSectionStylerClasses?.AppDetailSectionList || "AppDetailSectionList";
      overviewPanel.appendChild(playSection);
      overviewPanel.appendChild(sectionList);
      doc.body.appendChild(overviewPanel);

      const sections = findSteamContentSections(overviewPanel, playSection);
      expect(sections).toContain(sectionList);
    });

    it("returns siblings after play bar when inside overviewPanel", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const overviewPanel = doc.createElement("div");
      const playSection = doc.createElement("div");
      playSection.className = "PlaySection";
      const sibling1 = doc.createElement("div");
      sibling1.className = "other-content-1";
      const sibling2 = doc.createElement("div");
      sibling2.className = "other-content-2";
      overviewPanel.appendChild(playSection);
      overviewPanel.appendChild(sibling1);
      overviewPanel.appendChild(sibling2);
      doc.body.appendChild(overviewPanel);

      const sections = findSteamContentSections(overviewPanel, playSection);
      expect(sections).toEqual([sibling1, sibling2]);
    });

    it("correctly identifies inner container and hides following content siblings with hashed class names", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const overviewPanel = doc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";
      const innerContainer = doc.createElement("div");
      innerContainer.className = "_27RcNu8aXKBpYkHcNNrt-X _2OOzYVWIHaKXm6_7sscT9i";
      const playBar = doc.createElement("div");
      playBar.className = "_3fLo166MlaNqP8r8tTyRz _1U7LKpx70kEsz3jJwAFOi-";
      const playButton = doc.createElement("button");
      playBar.appendChild(playButton);
      const shortcutNotice = doc.createElement("div");
      shortcutNotice.className = "_2K2bYzcKrhqLqDp0Jy6Ksz _2jPMy2QZr8bWi6yrk5ZzHA";
      const columnContainer = doc.createElement("div");
      columnContainer.className = "OhSdLYuggDtBcWjYP0j_9";

      innerContainer.appendChild(playBar);
      innerContainer.appendChild(shortcutNotice);
      innerContainer.appendChild(columnContainer);
      overviewPanel.appendChild(innerContainer);
      doc.body.appendChild(overviewPanel);

      const sections = findSteamContentSections(overviewPanel, playButton);
      expect(sections).toContain(shortcutNotice);
      expect(sections).toContain(columnContainer);
      expect(sections).not.toContain(playBar);
    });
  });

  describe("lifecycle and mounting", () => {
    it("no-ops when target window has no document body", () => {
      const emptyWin = {} as Window;
      const stop = startDesktopNavigationWatcher(emptyWin);
      expect(typeof stop).toBe("function");
      stop();
    });

    it("mounts on RomM shortcut preserving play bar and unmounts on non-RomM navigation", () => {
      const mockRoot = {
        render: vi.fn(),
        unmount: vi.fn(),
      };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const ovClass = deckyUiInternals.appDetailsClasses?.AppDetailsOverviewPanel || "AppDetailsOverviewPanel";
      const psClass = deckyUiInternals.basicAppDetailsSectionStylerClasses?.PlaySection || "PlaySection";
      const listClass =
        deckyUiInternals.basicAppDetailsSectionStylerClasses?.AppDetailSectionList || "AppDetailSectionList";

      // Setup DOM with both playSection and contentSection
      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const steamPanel = mockDoc.createElement("div");
      steamPanel.className = ovClass;

      const playSection = mockDoc.createElement("div");
      playSection.className = psClass;
      steamPanel.appendChild(playSection);

      const contentSection = mockDoc.createElement("div");
      contentSection.className = listClass;
      steamPanel.appendChild(contentSection);

      parent.appendChild(steamPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(123),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/50000" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/50000" },
      };

      vi.spyOn(rommAppIds, "isRomMAppId").mockImplementation((id) => id === 50000);

      // Start watching
      const stop = startDesktopNavigationWatcher(mockWin);

      // Verify mounting: play bar and steam panel are preserved visible; only content is hidden
      expect(steamPanel.style.display).not.toBe("none");
      expect(playSection.style.display).not.toBe("none");
      expect(contentSection.style.display).toBe("none");

      const host = mockDoc.getElementById(TENDER_SUBSTITUTE_ID);
      expect(host).not.toBeNull();
      expect(host?.dataset.appid).toBe("50000");
      // host is inserted right after playSection
      expect(playSection.nextElementSibling).toBe(host);
      expect(mockRoot.render).toHaveBeenCalledTimes(1);

      // Re-invoking reinject with same appId should not re-render
      // Navigate to a non-RomM app (e.g. 60000)
      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/60000" },
      };

      // Trigger navigation interval check
      const intervalCallback = vi.mocked(mockWin.setInterval).mock.calls[0]?.[0];
      if (typeof intervalCallback === "function") {
        intervalCallback();
      }

      // Verify unmount and restoration
      expect(mockRoot.unmount).toHaveBeenCalledTimes(1);
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
      expect(contentSection.style.display).toBe("");
      expect(playSection.style.display).toBe("");
      expect(steamPanel.style.display).toBe("");

      stop();
      expect(mockWin.clearInterval).toHaveBeenCalledWith(123);
    });

    it("defers mounting when overview panel or play section is initially absent and mounts when they appear", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      mockDoc.body.appendChild(parent);

      let observerCallback: (() => void) | undefined;
      class TestMutationObserver {
        constructor(cb: () => void) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(123),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: TestMutationObserver as unknown as typeof MutationObserver,
        location: { pathname: "/library/app/555" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/555" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      startDesktopNavigationWatcher(mockWin);

      // Should not mount into d.body when steam overview panel is absent
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
      expect(mockRoot.render).not.toHaveBeenCalled();

      // Steam asynchronously inserts AppDetailsOverviewPanel with PlaySection
      const steamPanel = mockDoc.createElement("div");
      steamPanel.className = "AppDetailsOverviewPanel";
      const playSection = mockDoc.createElement("div");
      playSection.className = "PlaySection";
      const contentSection = mockDoc.createElement("div");
      contentSection.className = "AppDetailSectionList";
      steamPanel.appendChild(playSection);
      steamPanel.appendChild(contentSection);
      parent.appendChild(steamPanel);

      // Mutation observer fires
      if (observerCallback) {
        observerCallback();
      }

      // Should now be mounted with play section visible and content section hidden
      expect(steamPanel.style.display).not.toBe("none");
      expect(playSection.style.display).not.toBe("none");
      expect(contentSection.style.display).toBe("none");

      const host = mockDoc.getElementById(TENDER_SUBSTITUTE_ID);
      expect(host).not.toBeNull();
      expect(host?.dataset.appid).toBe("555");
      expect(host?.parentElement).toBe(steamPanel);
      expect(mockRoot.render).toHaveBeenCalledTimes(1);

      stopDesktopNavigationWatcher();
    });

    it("re-hides content section if Steam re-renders it after our mount", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const steamPanel = mockDoc.createElement("div");
      steamPanel.className = "AppDetailsOverviewPanel";

      const playSection = mockDoc.createElement("div");
      playSection.className = "PlaySection";
      const contentSection = mockDoc.createElement("div");
      contentSection.className = "AppDetailSectionList";
      steamPanel.appendChild(playSection);
      steamPanel.appendChild(contentSection);

      parent.appendChild(steamPanel);
      mockDoc.body.appendChild(parent);

      let observerCallback: (() => void) | undefined;
      class TestMutationObserver {
        constructor(cb: () => void) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(123),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: TestMutationObserver as unknown as typeof MutationObserver,
        location: { pathname: "/library/app/888" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/888" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      startDesktopNavigationWatcher(mockWin);
      expect(contentSection.style.display).toBe("none");

      // Steam re-renders and un-hides content section
      contentSection.style.display = "";

      // MutationObserver fires
      if (observerCallback) {
        observerCallback();
      }

      // It must be re-hidden without remounting React root
      expect(contentSection.style.display).toBe("none");
      expect(mockRoot.render).toHaveBeenCalledTimes(1);

      stopDesktopNavigationWatcher();
    });

    it("switches to new RomM game cleanly", () => {
      const mockRoot = {
        render: vi.fn(),
        unmount: vi.fn(),
      };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const ovClass = deckyUiInternals.appDetailsClasses?.AppDetailsOverviewPanel || "AppDetailsOverviewPanel";

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const steamPanel = mockDoc.createElement("div");
      steamPanel.className = ovClass;
      const playSection = mockDoc.createElement("div");
      playSection.className = "PlaySection";
      const contentSection = mockDoc.createElement("div");
      contentSection.className = "AppDetailSectionList";
      steamPanel.appendChild(playSection);
      steamPanel.appendChild(contentSection);
      mockDoc.body.appendChild(steamPanel);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(123),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/111" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/111" },
      };

      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      startDesktopNavigationWatcher(mockWin);
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)?.dataset.appid).toBe("111");

      // Navigate to 222
      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/222" },
      };
      const intervalCallback = vi.mocked(mockWin.setInterval).mock.calls[0]?.[0];
      if (typeof intervalCallback === "function") {
        intervalCallback();
      }

      expect(mockRoot.unmount).toHaveBeenCalledTimes(1);
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)?.dataset.appid).toBe("222");

      stopDesktopNavigationWatcher();
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
    });

    it("handles createRoot error by cleaning up host and resetting display", () => {
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockImplementation(() => {
          throw new Error("Root mount failure");
        }),
      });

      const ovClass = deckyUiInternals.appDetailsClasses?.AppDetailsOverviewPanel || "AppDetailsOverviewPanel";
      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const steamPanel = mockDoc.createElement("div");
      steamPanel.className = ovClass;
      const playSection = mockDoc.createElement("div");
      playSection.className = "PlaySection";
      const contentSection = mockDoc.createElement("div");
      contentSection.className = "AppDetailSectionList";
      steamPanel.appendChild(playSection);
      steamPanel.appendChild(contentSection);
      parent.appendChild(steamPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(123),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/444" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      startDesktopNavigationWatcher(mockWin);
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
      expect(contentSection.style.display).toBe("");

      stopDesktopNavigationWatcher();
    });

    it("mounts directly after playBar inside innerContainer, hiding shortcut notice and notes/recordings panel", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";
      const innerContainer = mockDoc.createElement("div");
      innerContainer.className = "Container Glassy";

      const playBar = mockDoc.createElement("div");
      playBar.className = deckyUiInternals.playSectionClasses?.PlayBar || "PlayBar";
      const playButton = mockDoc.createElement("button");
      playBar.appendChild(playButton);

      const shortcutNotice = mockDoc.createElement("div");
      shortcutNotice.className = "hashed-shortcut-notice";
      const columnContainer = mockDoc.createElement("div");
      columnContainer.className = "hashed-column-container";

      innerContainer.appendChild(playBar);
      innerContainer.appendChild(shortcutNotice);
      innerContainer.appendChild(columnContainer);
      overviewPanel.appendChild(innerContainer);
      parent.appendChild(overviewPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(999),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/70000" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/70000" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // PlayBar is kept visible
      expect(playBar.style.display).not.toBe("none");
      // Both the shortcut notice and the notes/recordings panel are hidden
      expect(shortcutNotice.style.display).toBe("none");
      expect(columnContainer.style.display).toBe("none");

      // Substitute is mounted directly inside innerContainer, right after playBar
      const host = mockDoc.getElementById(TENDER_SUBSTITUTE_ID);
      expect(host).not.toBeNull();
      expect(host?.parentElement).toBe(innerContainer);
      expect(playBar.nextElementSibling).toBe(host);

      stop();
      expect(shortcutNotice.style.display).toBe("");
      expect(columnContainer.style.display).toBe("");
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
    });
  });
});
