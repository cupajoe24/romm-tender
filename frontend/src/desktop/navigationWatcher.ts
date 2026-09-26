/**
 * Navigation watcher and DOM coordinator for Steam's Desktop client.
 *
 * In desktop mode, page navigation changes `MainWindowBrowserManager.m_lastLocation`.
 * Uses a polling check on `m_lastLocation`, `MutationObserver` on the desktop window's
 * document body, and an atomic DOM restoration ledger to mount/unmount Tender on
 * RomM shortcut detail pages without leaving orphaned styles or hidden elements.
 */

import { createElement } from "react";
import { isRomMAppId, onRomMAppIdsChanged } from "../utils/rommAppIds";
import { findDesktopWindow, findReactClient } from "./desktopWindow";
import { GameView } from "./gameview/GameView";
import { PlayButton, ensurePulseStyles } from "./gameview/PlayButton";
import { getAppIdFromFiber } from "./watcher/fiberInspector";
import { DomRestorationLedger } from "./watcher/restorationLedger";
import {
  TENDER_PLAY_BUTTON_ID,
  TENDER_SUBSTITUTE_ID,
  containsContentSections,
  findPlayBarAndContainer,
  findSteamContentSections,
  findSteamOverviewPanel,
  findSteamPlayBarBadges,
  findSteamPlayButton,
  findSteamPlaySection,
  findSteamRightControls,
  findSteamStickyPlayBar,
  getDirectChild,
  getDocument,
  isPlayBarElement,
  isRightControlsElement,
  isTenderElement,
} from "./watcher/elementSelectors";
import {
  createStickyPlayBarController,
  findInflatedHeroWrapper,
  findScrollContainer,
  isPlayBarPinned,
  type StickyPlayBarController,
} from "./watcher/stickyPlayBarController";

// Re-export selectors, helpers, and constants for backward compatibility
export {
  TENDER_PLAY_BUTTON_ID,
  TENDER_SUBSTITUTE_ID,
  containsContentSections,
  findInflatedHeroWrapper,
  findPlayBarAndContainer,
  findScrollContainer,
  findSteamContentSections,
  findSteamOverviewPanel,
  findSteamPlayBarBadges,
  findSteamPlayButton,
  findSteamPlaySection,
  findSteamRightControls,
  findSteamStickyPlayBar,
  getDirectChild,
  getDocument,
  isPlayBarElement,
  isPlayBarPinned,
  isRightControlsElement,
  isTenderElement,
};

interface MainWindowBrowserManagerStub {
  m_lastLocation?: {
    pathname?: string;
  };
}

interface WindowWithManager extends Window {
  MainWindowBrowserManager?: MainWindowBrowserManagerStub;
}

/**
 * Extract shortcut appId from a path string (e.g. `/library/app/12345`).
 */
export function appIdOf(path: string | undefined | null): number | null {
  if (!path) return null;
  const match = /\/library\/app\/(\d+)/.exec(path);
  return match ? Number(match[1]) : null;
}

let activeWatcherStop: (() => void) | null = null;
let supervisorInterval: number | null = null;

function attachToDesktopWindow(deskWin: Window): () => void {
  const d = deskWin.document;
  const ledger = new DomRestorationLedger();
  let stickyController: StickyPlayBarController | null = null;
  let activeAppId: number | null = null;
  let lastPath: string | null = null;

  function unmountCurrent() {
    if (stickyController) {
      stickyController.dispose();
      stickyController = null;
    }
    ledger.restoreAll();
    activeAppId = null;

    const existingSub = d.getElementById(TENDER_SUBSTITUTE_ID);
    if (existingSub) {
      existingSub.remove();
    }
    const existingPb = d.getElementById(TENDER_PLAY_BUTTON_ID);
    if (existingPb) {
      existingPb.remove();
    }

    // Safety: ensure any accidentally hidden overview panel is visible again
    const currentSteamPanel = findSteamOverviewPanel(d);
    if (currentSteamPanel && currentSteamPanel.style.display === "none") {
      currentSteamPanel.style.display = "";
    }
  }

  function reinject() {
    const manager =
      (deskWin as unknown as WindowWithManager).MainWindowBrowserManager ||
      (window as unknown as WindowWithManager).MainWindowBrowserManager;
    const path = manager?.m_lastLocation?.pathname || deskWin.location.pathname;
    let appId = appIdOf(path);

    const existingSubstitute = d.getElementById(TENDER_SUBSTITUTE_ID);
    const existingPlayBtn = d.getElementById(TENDER_PLAY_BUTTON_ID);

    // Fallback: If URL doesn't yield an appId, inspect fiber on overview panel
    if (!appId) {
      const overviewCandidate = findSteamOverviewPanel(d);
      if (overviewCandidate) {
        appId = getAppIdFromFiber(overviewCandidate);
      }
    }

    // If not on a RomM shortcut page, clean up any active mount
    if (!appId || !isRomMAppId(appId)) {
      if (existingSubstitute || existingPlayBtn || activeAppId !== null) {
        unmountCurrent();
      }
      return;
    }

    // Ensure desktop styles (including pulsing keyframes) are loaded in the document
    ensurePulseStyles(d);

    // Locate Steam's native overview panel
    const steamPanel = findSteamOverviewPanel(d);
    if (!steamPanel || !steamPanel.parentElement) {
      return;
    }

    // Locate Steam's native play section
    const playSection = findSteamPlaySection(steamPanel) || findSteamPlaySection(d);
    if (!playSection) {
      return;
    }

    // Ensure steamPanel itself is visible
    if (steamPanel.contains(playSection) && steamPanel.style.display === "none") {
      steamPanel.style.display = "";
    }

    const client = findReactClient();
    if (!client) {
      return;
    }

    // Locate play bar and content container
    const { playBarTop, container } = findPlayBarAndContainer(steamPanel, playSection);

    // 1. Hide native content sections (non-Steam placeholder, notes, screenshots)
    const contentSections = findSteamContentSections(steamPanel, playSection);
    for (const sec of contentSections) {
      ledger.hide(sec);
    }

    // 2. Replace native Play button in playSection with our PlayButton
    const nativePlayBtn = findSteamPlayButton(playSection);
    if (nativePlayBtn) {
      ledger.hide(nativePlayBtn);

      let playBtnHost = d.getElementById(TENDER_PLAY_BUTTON_ID);
      const needsPlayBtnMount = !playBtnHost || !playBtnHost.isConnected || playBtnHost.dataset.appid !== String(appId);

      if (needsPlayBtnMount) {
        if (playBtnHost) {
          playBtnHost.remove();
        }

        playBtnHost = d.createElement("div");
        playBtnHost.id = TENDER_PLAY_BUTTON_ID;
        playBtnHost.dataset.appid = String(appId);
        playBtnHost.style.overflow = "visible";
        playBtnHost.style.paddingBottom = "2px";

        if (nativePlayBtn.parentElement) {
          nativePlayBtn.parentElement.insertBefore(playBtnHost, nativePlayBtn);
        }

        try {
          ensurePulseStyles(d);
          const pbRoot = client.createRoot(playBtnHost);
          pbRoot.render(createElement(PlayButton, { appId }));
          ledger.recordRoot(pbRoot, playBtnHost);
        } catch {
          if (playBtnHost.isConnected) {
            playBtnHost.remove();
          }
        }
      }
    }

    // 3. Setup sticky play bar behavior and scroll monitoring
    if (!stickyController) {
      stickyController = createStickyPlayBarController(playBarTop, playSection, ledger, container, steamPanel);
    } else {
      stickyController.updatePinning();
    }

    // 4. Contain hero wrapper overflow (prevent canvas elements from inflating scrollHeight)
    const scroller = findScrollContainer(playBarTop);
    const heroWrapper =
      findInflatedHeroWrapper(container, playBarTop, scroller) ||
      (() => {
        const heroQuery = steamPanel.querySelector<HTMLElement>(
          '[class*="Hero"], [class*="hero"], [class*="HeroHeader"], [class*="HeroBanner"]',
        );
        if (heroQuery && heroQuery !== playBarTop && !heroQuery.contains(playBarTop)) {
          return heroQuery;
        }
        const fc = steamPanel.firstElementChild as HTMLElement | null;
        return fc && fc !== playBarTop && !fc.contains(playBarTop) ? fc : null;
      })();
    if (heroWrapper && heroWrapper.style.overflow !== "hidden") {
      ledger.style(heroWrapper, "overflow", "hidden");
    }

    // 5. Hide Steam's duplicate sticky header
    const duplicateSticky = findSteamStickyPlayBar(d, playBarTop);
    if (duplicateSticky) {
      ledger.hide(duplicateSticky);
    }

    // 6. Hide native play bar badges (Last Played, Playtime, Cloud Status, etc.)
    const badgeElements = findSteamPlayBarBadges(playBarTop, nativePlayBtn);
    if (!playBarTop.contains(playSection)) {
      for (const badge of findSteamPlayBarBadges(playSection, nativePlayBtn)) {
        if (!badgeElements.includes(badge)) {
          badgeElements.push(badge);
        }
      }
    }
    for (const badge of badgeElements) {
      ledger.hide(badge);
    }

    // 7. Pin Steam's right-side controls container to the right edge
    const rightControls = findSteamRightControls(playBarTop) ?? findSteamRightControls(playSection);
    if (rightControls) {
      ledger.style(rightControls, "margin-left", "auto");
    }

    // 8. Determine insertion target: immediately after the play bar
    const insertParent = container;
    const insertBeforeRef = playBarTop.nextElementSibling as HTMLElement | null;

    if (
      existingSubstitute &&
      existingSubstitute.isConnected &&
      existingSubstitute.dataset.appid === String(appId) &&
      existingSubstitute.parentElement === insertParent
    ) {
      return;
    }

    // Navigation from a different RomM game or fresh mount: clean up first
    if (existingSubstitute) {
      unmountCurrent();
      for (const sec of contentSections) {
        ledger.hide(sec);
      }
    }
    activeAppId = appId;

    // 9. Mount GameView immediately after the play bar
    const host = d.createElement("div");
    host.id = TENDER_SUBSTITUTE_ID;
    host.className = "tender-desktop-cards-container";
    host.dataset.appid = String(appId);

    if (insertBeforeRef && insertBeforeRef.parentElement === insertParent) {
      insertParent.insertBefore(host, insertBeforeRef);
    } else {
      insertParent.appendChild(host);
    }

    try {
      const gvRoot = client.createRoot(host);
      gvRoot.render(createElement(GameView, { appId }));
      ledger.recordRoot(gvRoot, host);
    } catch {
      if (host.isConnected) {
        host.remove();
      }
      unmountCurrent();
    }
  }

  const checkNav = () => {
    if (deskWin.closed) {
      return;
    }
    const manager =
      (deskWin as unknown as WindowWithManager).MainWindowBrowserManager ||
      (window as unknown as WindowWithManager).MainWindowBrowserManager;
    const p = manager?.m_lastLocation?.pathname || deskWin.location.pathname;
    const appId = appIdOf(p);
    const isRomM = appId ? isRomMAppId(appId) : false;
    const substitute = d.getElementById(TENDER_SUBSTITUTE_ID);
    const playBtn = d.getElementById(TENDER_PLAY_BUTTON_ID);
    const isMountedForCurrent =
      substitute && substitute.dataset.appid === String(appId) && playBtn && playBtn.dataset.appid === String(appId);

    if (p !== lastPath || (isRomM && !isMountedForCurrent)) {
      lastPath = p || null;
      reinject();
      if (typeof deskWin.setTimeout === "function") {
        deskWin.setTimeout(reinject, 100);
        deskWin.setTimeout(reinject, 300);
        deskWin.setTimeout(reinject, 600);
      }
    } else if (isRomM && isMountedForCurrent) {
      reinject();
    }
  };

  const iv = deskWin.setInterval(checkNav, 250);

  const WinObserver = (deskWin as { MutationObserver?: typeof MutationObserver }).MutationObserver || MutationObserver;
  const mo = new WinObserver(() => reinject());
  mo.observe(d.body, { childList: true, subtree: true });

  const unlistenAppIds = onRomMAppIdsChanged(() => {
    reinject();
  });

  const stop = () => {
    if (typeof deskWin.clearInterval === "function") {
      deskWin.clearInterval(iv);
    }
    mo.disconnect();
    unlistenAppIds();
    unmountCurrent();
  };

  reinject();
  if (typeof deskWin.setTimeout === "function") {
    deskWin.setTimeout(reinject, 100);
    deskWin.setTimeout(reinject, 300);
    deskWin.setTimeout(reinject, 600);
  }
  return stop;
}

export function startDesktopNavigationWatcher(customWin?: Window): () => void {
  stopDesktopNavigationWatcher();

  if (customWin) {
    if (typeof customWin.setInterval !== "function") {
      return () => {};
    }
    const stop = attachToDesktopWindow(customWin);
    activeWatcherStop = stop;
    return () => {
      stop();
      if (activeWatcherStop === stop) {
        activeWatcherStop = null;
      }
    };
  }

  let currentDeskWin: Window | null = null;
  let currentDetach: (() => void) | null = null;

  const detachCurrent = () => {
    if (currentDetach) {
      try {
        currentDetach();
      } catch {
        // Ignored
      }
      currentDetach = null;
    }
    currentDeskWin = null;
  };

  const pollDesktop = () => {
    const foundWin = findDesktopWindow();

    if (currentDeskWin && (currentDeskWin.closed || currentDeskWin !== foundWin)) {
      detachCurrent();
    }

    if (foundWin && !foundWin.closed && currentDeskWin !== foundWin) {
      currentDeskWin = foundWin;
      currentDetach = attachToDesktopWindow(foundWin);
    }
  };

  pollDesktop();

  const popupManager = (
    window as unknown as {
      g_PopupManager?: {
        AddPopupCreatedCallback?: (cb: () => void) => void;
        AddPopupDestroyedCallback?: (cb: () => void) => void;
      };
    }
  ).g_PopupManager;
  if (typeof popupManager?.AddPopupCreatedCallback === "function") {
    try {
      popupManager.AddPopupCreatedCallback(pollDesktop);
    } catch {
      // Ignored
    }
  }
  if (typeof popupManager?.AddPopupDestroyedCallback === "function") {
    try {
      popupManager.AddPopupDestroyedCallback(pollDesktop);
    } catch {
      // Ignored
    }
  }

  if (typeof window.setInterval === "function") {
    supervisorInterval = window.setInterval(pollDesktop, 500);
  }

  const stop = () => {
    if (supervisorInterval !== null && typeof window.clearInterval === "function") {
      window.clearInterval(supervisorInterval);
      supervisorInterval = null;
    }
    detachCurrent();
    if (activeWatcherStop === stop) {
      activeWatcherStop = null;
    }
  };

  activeWatcherStop = stop;
  return stop;
}

export function stopDesktopNavigationWatcher(): void {
  if (activeWatcherStop) {
    activeWatcherStop();
    activeWatcherStop = null;
  }
  if (supervisorInterval !== null && typeof window.clearInterval === "function") {
    window.clearInterval(supervisorInterval);
    supervisorInterval = null;
  }
}
