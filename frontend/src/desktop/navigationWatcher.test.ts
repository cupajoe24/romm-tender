import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  appIdOf,
  findSteamOverviewPanel,
  findSteamPlaySection,
  findSteamPlayButton,
  findSteamContentSections,
  findSteamPlayBarBadges,
  findSteamRightControls,
  isTenderElement,
  isRightControlsElement,
  startDesktopNavigationWatcher,
  stopDesktopNavigationWatcher,
  TENDER_SUBSTITUTE_ID,
  TENDER_PLAY_BUTTON_ID,
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

  describe("findSteamPlayButton", () => {
    it("finds play button via PlayButtonContainer class", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const pbc = doc.createElement("div");
      pbc.className = deckyUiInternals.appActionButtonClasses?.PlayButtonContainer || "PlayButtonContainer";
      doc.body.appendChild(pbc);

      expect(findSteamPlayButton(doc)).toBe(pbc);
    });

    it("finds play button via PlayButton class", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const btn = doc.createElement("button");
      btn.className = deckyUiInternals.appActionButtonClasses?.PlayButton || "PlayButton";
      doc.body.appendChild(btn);

      expect(findSteamPlayButton(doc)).toBe(btn);
    });

    it("returns PlayButtonContainer parent if button is wrapped in one", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const container = doc.createElement("div");
      container.className = "custom_PlayButtonContainer_hash";
      const btn = doc.createElement("button");
      btn.className = "PlayButton";
      container.appendChild(btn);
      doc.body.appendChild(container);

      expect(findSteamPlayButton(doc)).toBe(container);
    });

    it("returns null when no play button elements exist", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      expect(findSteamPlayButton(doc)).toBeNull();
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

    it("elevates playBarTop to in-page play bar container when playBar is wrapped inside it", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const overviewPanel = doc.createElement("div");
      overviewPanel.className = "AppDetailsOverviewPanel";
      const innerContainer = doc.createElement("div");
      innerContainer.className = "_27RcNu8aXKBpYkHcNNrt-X _2OOzYVWIHaKXm6_7sscT9i";

      const inPageContainer = doc.createElement("div");
      inPageContainer.className = "_3Yf8b2v5oOD8Wqsxu04ar _1U7LKpx70kEsz3jJwAFOi-";
      const playBar = doc.createElement("div");
      playBar.className = "_3fLo166MlaNqP8r8tTyRz _3DeO92O5aVkcdwEBCJDjWm";
      const playBtn = doc.createElement("button");
      playBar.appendChild(playBtn);
      const shadow = doc.createElement("div");
      shadow.className = "_2_86QNCjVvJTL3Qe6Xztx_";
      inPageContainer.appendChild(playBar);
      inPageContainer.appendChild(shadow);

      const columnContainer = doc.createElement("div");
      columnContainer.className = "OhSdLYuggDtBcWjYP0j_9";

      innerContainer.appendChild(inPageContainer);
      innerContainer.appendChild(columnContainer);
      overviewPanel.appendChild(innerContainer);
      doc.body.appendChild(overviewPanel);

      const sections = findSteamContentSections(overviewPanel, playBtn);
      expect(sections).toContain(columnContainer);
      expect(sections).not.toContain(inPageContainer);
      expect(sections).not.toContain(playBar);
      expect(sections).not.toContain(shadow);
    });
  });

  describe("findSteamPlayBarBadges", () => {
    it("identifies StatusAndStats and GameStatsSection containers", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const statusAndStats = doc.createElement("div");
      statusAndStats.className = "playsection_StatusAndStats_hash";
      const statsSection = doc.createElement("div");
      statsSection.className = "GameStatsSection";

      statusAndStats.appendChild(statsSection);
      playBar.appendChild(statusAndStats);

      const badges = findSteamPlayBarBadges(playBar);
      expect(badges).toContain(statusAndStats);
      expect(badges).toContain(statsSection);
    });

    it("identifies individual stat items like LastPlayed, Playtime, CloudStatus, MiniAchievements", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const lastPlayed = doc.createElement("div");
      lastPlayed.className = "custom_LastPlayed_123";
      const playtime = doc.createElement("div");
      playtime.className = "custom_Playtime_456";
      const cloudStatus = doc.createElement("div");
      cloudStatus.className = "CloudStatusRow";
      const achievements = doc.createElement("div");
      achievements.className = "MiniAchievements";

      playBar.appendChild(lastPlayed);
      playBar.appendChild(playtime);
      playBar.appendChild(cloudStatus);
      playBar.appendChild(achievements);

      const badges = findSteamPlayBarBadges(playBar);
      expect(badges).toContain(lastPlayed);
      expect(badges).toContain(playtime);
      expect(badges).toContain(cloudStatus);
      expect(badges).toContain(achievements);
    });

    it("identifies stat items by PlayBarDetailLabel or text fallback", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const statItem1 = doc.createElement("div");
      statItem1.className = "game-stat-wrapper";
      const label1 = doc.createElement("div");
      label1.className = "PlayBarDetailLabel";
      label1.textContent = "LAST PLAYED";
      statItem1.appendChild(label1);

      const statItem2 = doc.createElement("div");
      statItem2.className = "custom-wrapper";
      const label2 = doc.createElement("div");
      label2.textContent = "Last Played";
      statItem2.appendChild(label2);

      playBar.appendChild(statItem1);
      playBar.appendChild(statItem2);

      const badges = findSteamPlayBarBadges(playBar);
      expect(badges).toContain(statItem1);
      expect(badges).toContain(statItem2);
    });

    it("ignores Tender elements and custom badges", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const tenderHost = doc.createElement("div");
      tenderHost.id = TENDER_PLAY_BUTTON_ID;
      const tenderBadge = doc.createElement("div");
      tenderBadge.className = "tender-desktop-badge-item tender-desktop-last-played";
      const tenderLabel = doc.createElement("div");
      tenderLabel.textContent = "LAST PLAYED";
      tenderBadge.appendChild(tenderLabel);
      tenderHost.appendChild(tenderBadge);
      playBar.appendChild(tenderHost);

      const badges = findSteamPlayBarBadges(playBar);
      expect(badges).toHaveLength(0);
      expect(isTenderElement(tenderHost)).toBe(true);
      expect(isTenderElement(tenderBadge)).toBe(true);
    });

    it("ignores RightControls and action buttons (gear, controller, heart)", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const rightControls = doc.createElement("div");
      rightControls.className = "RightControls AppButtonsContainer";
      const gearBtn = doc.createElement("button");
      gearBtn.className = "AppActionButton";
      rightControls.appendChild(gearBtn);
      playBar.appendChild(rightControls);

      expect(isRightControlsElement(rightControls)).toBe(true);
      const badges = findSteamPlayBarBadges(playBar);
      expect(badges).not.toContain(rightControls);
      expect(badges).not.toContain(gearBtn);
    });

    it("ignores nativePlayBtn when provided", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      const playBtn = doc.createElement("button");
      playBtn.className = "PlayButton AppActionButton";
      playBar.appendChild(playBtn);

      const badges = findSteamPlayBarBadges(playBar, playBtn);
      expect(badges).not.toContain(playBtn);
    });
  });

  describe("findSteamRightControls", () => {
    it("identifies RightControls container", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const rightControls = doc.createElement("div");
      rightControls.className = "playsection_RightControls_hash";
      playBar.appendChild(rightControls);

      expect(findSteamRightControls(playBar)).toBe(rightControls);
    });

    it("identifies AppButtonsContainer and AppButtons", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const appButtons = doc.createElement("div");
      appButtons.className = "AppButtonsContainer AppButtons";
      playBar.appendChild(appButtons);

      expect(findSteamRightControls(playBar)).toBe(appButtons);
    });

    it("identifies parent container by controller config or favorite button", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const wrapper = doc.createElement("div");
      wrapper.className = "custom-actions-wrapper";
      const configBtn = doc.createElement("button");
      configBtn.className = "ControllerConfigButton";
      wrapper.appendChild(configBtn);
      playBar.appendChild(wrapper);

      expect(findSteamRightControls(playBar)).toBe(wrapper);
    });

    it("ignores Tender elements even if classes match", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      playBar.className = "PlayBar";

      const tenderEl = doc.createElement("div");
      tenderEl.id = TENDER_PLAY_BUTTON_ID;
      tenderEl.className = "RightControls";
      playBar.appendChild(tenderEl);

      expect(findSteamRightControls(playBar)).toBeNull();
    });

    it("returns null when no right-side controls exist", () => {
      const doc = document.implementation.createHTMLDocument("Test");
      const playBar = doc.createElement("div");
      expect(findSteamRightControls(playBar)).toBeNull();
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

      // Hero banner overflow is set to hidden to eliminate bottom empty gap
      expect(heroBanner.style.overflow).toBe("hidden");

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
  });
});
