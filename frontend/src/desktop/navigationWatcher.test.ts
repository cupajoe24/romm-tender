import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appIdOf, startDesktopNavigationWatcher, stopDesktopNavigationWatcher } from "./navigationWatcher";
import { TENDER_PLAY_BUTTON_ID, TENDER_SUBSTITUTE_ID } from "./watcher/elementSelectors";
import {
  GLASS_PLAY_BAR_BG,
  GLASS_PLAY_BAR_GRADIENT,
  PINNED_PLAY_BAR_SHADOW,
  SOLID_PLAY_BAR_BG,
} from "./gameview/styles";
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

    it("mounts after inPageContainer when playBar is nested inside in-page wrapper", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";
      const innerContainer = mockDoc.createElement("div");
      innerContainer.className = "_27RcNu8aXKBpYkHcNNrt-X";

      const inPageContainer = mockDoc.createElement("div");
      inPageContainer.className = "_3Yf8b2v5oOD8Wqsxu04ar _1U7LKpx70kEsz3jJwAFOi- InPage";
      const playBar = mockDoc.createElement("div");
      playBar.className = "_3fLo166MlaNqP8r8tTyRz PlayBar";
      const playButton = mockDoc.createElement("button");
      playButton.className = "PlayButton";
      playBar.appendChild(playButton);
      inPageContainer.appendChild(playBar);

      const columnContainer = mockDoc.createElement("div");
      columnContainer.className = "OhSdLYuggDtBcWjYP0j_9";

      innerContainer.appendChild(inPageContainer);
      innerContainer.appendChild(columnContainer);
      overviewPanel.appendChild(innerContainer);
      parent.appendChild(overviewPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(888),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/70001" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/70001" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // PlayBar and inPageContainer are kept visible
      expect(inPageContainer.style.display).not.toBe("none");
      expect(columnContainer.style.display).toBe("none");

      // Substitute is mounted directly inside innerContainer, right after inPageContainer (not inside inPageContainer!)
      const host = mockDoc.getElementById(TENDER_SUBSTITUTE_ID);
      expect(host).not.toBeNull();
      expect(host?.parentElement).toBe(innerContainer);
      expect(inPageContainer.nextElementSibling).toBe(host);
      expect(inPageContainer.contains(host)).toBe(false);

      stop();
      expect(columnContainer.style.display).toBe("");
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
    });

    it("replaces native play button with Tender play button and restores on unmount", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";

      const playBar = mockDoc.createElement("div");
      playBar.className = "PlayBar";
      const nativePlayBtn = mockDoc.createElement("button");
      nativePlayBtn.className = deckyUiInternals.appActionButtonClasses?.PlayButton || "PlayButton";
      playBar.appendChild(nativePlayBtn);

      const contentSection = mockDoc.createElement("div");
      contentSection.className = "AppDetailSectionList";

      overviewPanel.appendChild(playBar);
      overviewPanel.appendChild(contentSection);
      parent.appendChild(overviewPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(123),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/99999" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/99999" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // Native play button should be hidden
      expect(nativePlayBtn.style.display).toBe("none");

      // Tender play button host should be created and inserted before native button
      const playBtnHost = mockDoc.getElementById(TENDER_PLAY_BUTTON_ID);
      expect(playBtnHost).not.toBeNull();
      expect(playBtnHost?.dataset.appid).toBe("99999");
      expect(playBtnHost?.style.paddingBottom).toBe("2px");
      expect(playBtnHost?.nextElementSibling).toBe(nativePlayBtn);

      // Stop watcher / unmount
      stop();

      // Native play button restored and Tender host removed
      expect(nativePlayBtn.style.display).toBe("");
      expect(mockDoc.getElementById(TENDER_PLAY_BUTTON_ID)).toBeNull();
      expect(mockRoot.unmount).toHaveBeenCalled();
    });

    it("hides Steam default play bar badges alongside native play button and restores on unmount", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";

      const playBar = mockDoc.createElement("div");
      playBar.className = "PlayBar";

      const nativePlayBtn = mockDoc.createElement("button");
      nativePlayBtn.className = "PlayButton";
      playBar.appendChild(nativePlayBtn);

      const nativeBadges = mockDoc.createElement("div");
      nativeBadges.className = "StatusAndStats";
      const lastPlayedItem = mockDoc.createElement("div");
      lastPlayedItem.className = "GameStat LastPlayed";
      lastPlayedItem.textContent = "LAST PLAYED Today";
      nativeBadges.appendChild(lastPlayedItem);
      playBar.appendChild(nativeBadges);

      const rightControls = mockDoc.createElement("div");
      rightControls.className = "RightControls";
      playBar.appendChild(rightControls);

      overviewPanel.appendChild(playBar);
      parent.appendChild(overviewPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(456),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/88888" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/88888" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // Native play button AND default badges should be hidden
      expect(nativePlayBtn.style.display).toBe("none");
      expect(nativeBadges.style.display).toBe("none");
      expect(lastPlayedItem.style.display).toBe("none");
      // Right controls must remain visible and pinned to the right
      expect(rightControls.style.display).not.toBe("none");
      expect(rightControls.style.marginLeft).toBe("auto");

      // Stop watcher / unmount
      stop();

      // Native badges, play button, and right controls margin restored
      expect(nativePlayBtn.style.display).toBe("");
      expect(nativeBadges.style.display).toBe("");
      expect(lastPlayedItem.style.display).toBe("");
      expect(rightControls.style.display).toBe("");
      expect(rightControls.style.marginLeft).toBe("");
    });

    it("isolates play bar container as sticky, hides duplicate sticky header, contains hero overflow, and restores on unmount", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const parent = mockDoc.createElement("div");
      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";

      const heroBanner = mockDoc.createElement("div");
      heroBanner.className = "HeroHeaderWrapper";
      overviewPanel.appendChild(heroBanner);

      const duplicateStickyPlayBar = mockDoc.createElement("div");
      duplicateStickyPlayBar.className = deckyUiInternals.appDetailsClasses?.PlayBar || "PlayBar";
      duplicateStickyPlayBar.style.position = "absolute";
      overviewPanel.appendChild(duplicateStickyPlayBar);

      const contentContainer = mockDoc.createElement("div");
      contentContainer.className = "_27RcNu8aXKBpYkHcNNrt-X";

      const inPagePlayBar = mockDoc.createElement("div");
      inPagePlayBar.className = "InPagePlayBarContainer InPage";
      const playBtn = mockDoc.createElement("button");
      playBtn.className = "PlayButton";
      inPagePlayBar.appendChild(playBtn);
      contentContainer.appendChild(inPagePlayBar);

      overviewPanel.appendChild(contentContainer);
      parent.appendChild(overviewPanel);
      mockDoc.body.appendChild(parent);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(777),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/55555" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/55555" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // PlayBar container is sticky at top so cards scroll independently
      expect(inPagePlayBar.style.position).toBe("sticky");
      expect(inPagePlayBar.style.top).toBe("0px");
      expect(inPagePlayBar.style.zIndex).toBe("10");
      expect(inPagePlayBar.style.backgroundColor).toBe("rgb(39, 44, 53)");
      expect(inPagePlayBar.style.paddingBottom).toBe("2px");

      // Hero banner overflow is set to visible to preserve 3D parallax and refraction effect
      expect(heroBanner.style.overflow).toBe("visible");

      // Duplicate sticky header is hidden
      expect(duplicateStickyPlayBar.style.display).toBe("none");

      // Cards container has class tender-desktop-cards-container
      const host = mockDoc.getElementById(TENDER_SUBSTITUTE_ID);
      expect(host).not.toBeNull();
      expect(host?.className).toContain("tender-desktop-cards-container");

      // Stop watcher / unmount restores original properties
      stop();

      expect(inPagePlayBar.style.position).toBe("");
      expect(inPagePlayBar.style.top).toBe("");
      expect(inPagePlayBar.style.backgroundColor).toBe("");
      expect(inPagePlayBar.style.paddingBottom).toBe("");
      expect(heroBanner.style.overflow).toBe("");
      expect(duplicateStickyPlayBar.style.display).toBe("");
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).toBeNull();
    });

    it("contains hero overflow when steamPanel.firstElementChild wraps the play bar (desktop nested layout)", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      // Build the nested desktop layout:
      // scrollContainer > panel > heroWrapper(inflated) + contentPanel > overviewPanel(steamPanel) > playBar + ...
      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");

      const scrollContainer = mockDoc.createElement("div");
      Object.defineProperty(scrollContainer, "scrollHeight", { value: 1978, configurable: true });

      const panel = mockDoc.createElement("div");
      scrollContainer.appendChild(panel);

      // Hero wrapper with inflated scrollHeight (the bug target)
      const heroWrapper = mockDoc.createElement("div");
      heroWrapper.className = "HeroBanner";
      Object.defineProperty(heroWrapper, "scrollHeight", { value: 1978, configurable: true });
      Object.defineProperty(heroWrapper, "offsetHeight", { value: 307, configurable: true });
      panel.appendChild(heroWrapper);

      // Content panel wrapping the overview panel
      const contentPanel = mockDoc.createElement("div");
      panel.appendChild(contentPanel);

      // Overview panel (what findSteamOverviewPanel will return)
      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";
      contentPanel.appendChild(overviewPanel);

      const inPagePlayBar = mockDoc.createElement("div");
      inPagePlayBar.className = "InPagePlayBarContainer InPage";
      const playBtn = mockDoc.createElement("button");
      playBtn.className = "PlayButton";
      inPagePlayBar.appendChild(playBtn);
      overviewPanel.appendChild(inPagePlayBar);

      // Content section that should be hidden
      const contentSection = mockDoc.createElement("div");
      contentSection.className = "ColumnContainer";
      overviewPanel.appendChild(contentSection);

      mockDoc.body.appendChild(scrollContainer);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(888),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/77777" },
        getComputedStyle: (el: Element) => {
          if (el === scrollContainer) {
            return { ...window.getComputedStyle(el), overflowY: "scroll" } as CSSStyleDeclaration;
          }
          return window.getComputedStyle(el);
        },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/77777" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // The hero wrapper should have overflow:visible to preserve parallax and card refraction
      expect(heroWrapper.style.overflow).toBe("visible");

      stop();

      // Overflow should be restored on unmount
      expect(heroWrapper.style.overflow).toBe("");
    });

    it("contains hero wrapper overflow when it inflates asynchronously after substitute is already mounted", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");

      const scrollContainer = mockDoc.createElement("div");
      const panel = mockDoc.createElement("div");
      scrollContainer.appendChild(panel);

      // Hero wrapper initially NOT inflated (scrollHeight matches offsetHeight)
      const heroWrapper = mockDoc.createElement("div");
      heroWrapper.className = "HeroBanner";
      Object.defineProperty(heroWrapper, "scrollHeight", { value: 307, configurable: true });
      Object.defineProperty(heroWrapper, "offsetHeight", { value: 307, configurable: true });
      panel.appendChild(heroWrapper);

      const contentPanel = mockDoc.createElement("div");
      panel.appendChild(contentPanel);

      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";
      contentPanel.appendChild(overviewPanel);

      const inPagePlayBar = mockDoc.createElement("div");
      inPagePlayBar.className = "InPagePlayBarContainer InPage";
      const playBtn = mockDoc.createElement("button");
      playBtn.className = "PlayButton";
      inPagePlayBar.appendChild(playBtn);
      overviewPanel.appendChild(inPagePlayBar);

      const contentSection = mockDoc.createElement("div");
      contentSection.className = "ColumnContainer";
      overviewPanel.appendChild(contentSection);

      mockDoc.body.appendChild(scrollContainer);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(999),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/77778" },
        getComputedStyle: (el: Element) => {
          if (el === scrollContainer) {
            return { ...window.getComputedStyle(el), overflowY: "scroll" } as CSSStyleDeclaration;
          }
          return window.getComputedStyle(el);
        },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/77778" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // Initially, substitute is mounted, but hero wrapper is not yet inflated
      expect(mockDoc.getElementById(TENDER_SUBSTITUTE_ID)).not.toBeNull();
      expect(heroWrapper.style.overflow).toBe("");

      // Steam renders canvas in background: heroWrapper scrollHeight inflates
      Object.defineProperty(heroWrapper, "scrollHeight", { value: 1978, configurable: true });

      // Trigger interval check while substitute is ALREADY mounted
      const intervalCallback = vi.mocked(mockWin.setInterval).mock.calls[0]?.[0];
      if (typeof intervalCallback === "function") {
        intervalCallback();
      }

      // On reinject pass, hero wrapper should preserve visible overflow
      expect(heroWrapper.style.overflow).toBe("visible");

      stop();
      expect(heroWrapper.style.overflow).toBe("");
    });

    it("hides native duplicate sticky header when situated outside overviewPanel under main window split and restores on unmount", () => {
      const mockRoot = { render: vi.fn(), unmount: vi.fn() };
      vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
        createRoot: vi.fn().mockReturnValue(mockRoot),
      });

      const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
      const mainWindowSplit = mockDoc.createElement("div");
      mainWindowSplit.className = "MainWindowSplit";

      // Native sticky play bar sits outside the overview panel
      const duplicateStickyPlayBar = mockDoc.createElement("div");
      duplicateStickyPlayBar.className = deckyUiInternals.appDetailsClasses?.PlayBar || "PlayBar";
      mainWindowSplit.appendChild(duplicateStickyPlayBar);

      const scrollContainer = mockDoc.createElement("div");
      scrollContainer.className = "ScrollContainer";

      const overviewPanel = mockDoc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";

      const inPagePlayBar = mockDoc.createElement("div");
      inPagePlayBar.className = "InPagePlayBarContainer InPage";
      const playBtn = mockDoc.createElement("button");
      playBtn.className = "PlayButton";
      inPagePlayBar.appendChild(playBtn);
      overviewPanel.appendChild(inPagePlayBar);

      scrollContainer.appendChild(overviewPanel);
      mainWindowSplit.appendChild(scrollContainer);
      mockDoc.body.appendChild(mainWindowSplit);

      const mockWin = {
        document: mockDoc,
        setInterval: vi.fn().mockReturnValue(778),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(),
        MutationObserver: window.MutationObserver,
        location: { pathname: "/library/app/55556" },
      } as unknown as Window;

      (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
        m_lastLocation: { pathname: "/library/app/55556" },
      };
      vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

      const stop = startDesktopNavigationWatcher(mockWin);

      // Duplicate sticky header outside overviewPanel is hidden
      expect(duplicateStickyPlayBar.style.display).toBe("none");

      // Stop watcher restores original display
      stop();
      expect(duplicateStickyPlayBar.style.display).toBe("");
    });

    describe("dynamic play bar glass and solid pinning", () => {
      it("applies grey glass styling when unpinned and transitions to solid grey when pinned", () => {
        const mockRoot = { render: vi.fn(), unmount: vi.fn() };
        vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
          createRoot: vi.fn().mockReturnValue(mockRoot),
        });

        const mockDoc = document.implementation.createHTMLDocument("Steam Desktop Dynamic Pinned");
        const scroller = mockDoc.createElement("div");
        scroller.style.overflowY = "scroll";

        const overviewPanel = mockDoc.createElement("div");
        overviewPanel.className = "AppDetailsOverviewPanel";

        const inPagePlayBar = mockDoc.createElement("div");
        inPagePlayBar.className = "InPagePlayBarContainer InPage";

        const playSection = mockDoc.createElement("div");
        playSection.className = "PlaySection";
        const playBtn = mockDoc.createElement("button");
        playBtn.className = "PlayButton";
        playSection.appendChild(playBtn);
        inPagePlayBar.appendChild(playSection);

        overviewPanel.appendChild(inPagePlayBar);
        scroller.appendChild(overviewPanel);
        mockDoc.body.appendChild(scroller);

        let pbTop = 300;
        const scTop = 50;

        vi.spyOn(inPagePlayBar, "getBoundingClientRect").mockImplementation(
          () =>
            ({
              top: pbTop,
              bottom: pbTop + 50,
              left: 0,
              right: 1000,
              width: 1000,
              height: 50,
            }) as DOMRect,
        );

        vi.spyOn(scroller, "getBoundingClientRect").mockImplementation(
          () =>
            ({
              top: scTop,
              bottom: scTop + 600,
              left: 0,
              right: 1000,
              width: 1000,
              height: 600,
            }) as DOMRect,
        );

        const mockWin = {
          document: mockDoc,
          setInterval: vi.fn().mockReturnValue(779),
          clearInterval: vi.fn(),
          setTimeout: vi.fn(),
          MutationObserver: window.MutationObserver,
          location: { pathname: "/library/app/55557" },
        } as unknown as Window;

        (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
          m_lastLocation: { pathname: "/library/app/55557" },
        };
        vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

        const stop = startDesktopNavigationWatcher(mockWin);

        // Initially unpinned: grey glass styling
        expect(inPagePlayBar.style.position).toBe("sticky");
        expect(inPagePlayBar.style.top).toBe("0px");
        expect(inPagePlayBar.style.backgroundImage).toBe(GLASS_PLAY_BAR_GRADIENT);
        expect(inPagePlayBar.style.backgroundColor).toBe(GLASS_PLAY_BAR_BG);
        expect(inPagePlayBar.style.backdropFilter).toBe("blur(12px)");
        expect(inPagePlayBar.style.boxShadow).toBe("none");
        expect(playSection.style.backgroundColor).toBe("transparent");

        // Simulate scroll to top where play bar becomes pinned
        pbTop = 50;
        scroller.dispatchEvent(new Event("scroll"));

        expect(inPagePlayBar.style.backgroundImage).toBe("none");
        expect(inPagePlayBar.style.backgroundColor).toBe(SOLID_PLAY_BAR_BG);
        expect(inPagePlayBar.style.backdropFilter).toBe("none");
        expect(inPagePlayBar.style.boxShadow).toBe(PINNED_PLAY_BAR_SHADOW);
        expect(playSection.style.backgroundColor).toBe(SOLID_PLAY_BAR_BG);

        // Simulate scroll back to top (unpinned)
        pbTop = 300;
        scroller.dispatchEvent(new Event("scroll"));

        expect(inPagePlayBar.style.backgroundImage).toBe(GLASS_PLAY_BAR_GRADIENT);
        expect(inPagePlayBar.style.backgroundColor).toBe(GLASS_PLAY_BAR_BG);
        expect(inPagePlayBar.style.backdropFilter).toBe("blur(12px)");
        expect(inPagePlayBar.style.boxShadow).toBe("none");
        expect(playSection.style.backgroundColor).toBe("transparent");

        // Stop watcher restores original styles cleanly
        stop();
        expect(inPagePlayBar.style.position).toBe("");
        expect(inPagePlayBar.style.top).toBe("");
        expect(inPagePlayBar.style.backgroundImage).toBe("");
        expect(inPagePlayBar.style.backgroundColor).toBe("");
        expect(inPagePlayBar.style.backdropFilter).toBe("");
        expect(inPagePlayBar.style.boxShadow).toBe("");
        expect(playSection.style.backgroundColor).toBe("");
      });

      it("recreates sticky controller when playBarTop is replaced during Steam re-render", () => {
        const mockRoot = { render: vi.fn(), unmount: vi.fn() };
        vi.spyOn(desktopWin, "findReactClient").mockReturnValue({
          createRoot: vi.fn().mockReturnValue(mockRoot),
        });

        const mockDoc = document.implementation.createHTMLDocument("Steam Desktop");
        const parent = mockDoc.createElement("div");
        const overviewPanel = mockDoc.createElement("div");
        overviewPanel.className = "AppDetailsOverviewPanel";

        const playBar1 = mockDoc.createElement("div");
        playBar1.className = "PlayBar";
        const playBtn1 = mockDoc.createElement("button");
        playBtn1.className = "PlayButton";
        playBar1.appendChild(playBtn1);

        overviewPanel.appendChild(playBar1);
        parent.appendChild(overviewPanel);
        mockDoc.body.appendChild(parent);

        let checkNavCb: () => void = () => {};
        const mockWin = {
          document: mockDoc,
          setInterval: vi.fn().mockImplementation((cb) => {
            checkNavCb = cb;
            return 888;
          }),
          clearInterval: vi.fn(),
          setTimeout: vi.fn(),
          MutationObserver: window.MutationObserver,
          location: { pathname: "/library/app/55558" },
        } as unknown as Window;

        (window as unknown as { MainWindowBrowserManager?: unknown }).MainWindowBrowserManager = {
          m_lastLocation: { pathname: "/library/app/55558" },
        };
        vi.spyOn(rommAppIds, "isRomMAppId").mockReturnValue(true);

        const stop = startDesktopNavigationWatcher(mockWin);

        expect(playBar1.style.zIndex).toBe("10");

        // Simulate Steam re-rendering PlayBar element
        const playBar2 = mockDoc.createElement("div");
        playBar2.className = "PlayBar";
        const playBtn2 = mockDoc.createElement("button");
        playBtn2.className = "PlayButton";
        playBar2.appendChild(playBtn2);

        overviewPanel.replaceChild(playBar2, playBar1);

        // Run checkNav tick
        checkNavCb();

        expect(playBar2.style.zIndex).toBe("10");
        expect(playBar2.style.position).toBe("sticky");

        stop();
      });
    });
  });
});
