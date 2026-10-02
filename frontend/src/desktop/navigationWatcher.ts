/**
 * Navigation watcher and DOM coordinator for Steam's Desktop client.
 *
 * In desktop mode, page navigation changes `MainWindowBrowserManager.m_lastLocation`.
 * Uses a polling check on `m_lastLocation`, `MutationObserver` on the desktop window's
 * document body, and an atomic DOM restoration ledger to mount/unmount Tender on
 * RomM shortcut detail pages without leaving orphaned styles or hidden elements.
 */

import { createElement, type ComponentType } from "react";
import { isRomMAppId, onRomMAppIdsChanged } from "../utils/rommAppIds";
import { findDesktopWindow, findReactClient, type ReactClientModule } from "./desktopWindow";
import { ensurePulseStyles } from "./gameview/styles";
import { getAppIdFromFiber } from "./watcher/fiberInspector";
import { DomRestorationLedger } from "./watcher/restorationLedger";
import {
  TENDER_PLAY_BUTTON_ID,
  TENDER_SUBSTITUTE_ID,
  findHeroWrapperFallback,
  findPlayBarAndContainer,
  findSteamContentSections,
  findSteamOverviewPanel,
  findSteamPlayBarBadges,
  findSteamPlayButton,
  findSteamPlaySection,
  findSteamRightControls,
  findSteamStickyPlayBar,
} from "./watcher/elementSelectors";
import {
  createStickyPlayBarController,
  findInflatedHeroWrapper,
  findScrollContainer,
  type StickyPlayBarController,
} from "./watcher/stickyPlayBarController";

/**
 * What the watcher draws on a RomM game page. A part left out leaves Steam's
 * own in its place: without `gameView` the page's content sections stay, and
 * without `playButton` Steam's Play button and the badges beside it stay.
 */
export interface DesktopGamePage {
  /** Drawn below the play bar, in place of the page's content sections. */
  gameView?: ComponentType<{ appId: number }>;
  /** Drawn in place of Steam's Play button and its badges. */
  playButton?: ComponentType<{ appId: number }>;
}

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

function attachToDesktopWindow(page: DesktopGamePage, deskWin: Window): () => void {
  const { gameView: GameView, playButton: PlayButton } = page;
  const d = deskWin.document;
  const ledger = new DomRestorationLedger();
  let stickyController: StickyPlayBarController | null = null;
  let activeAppId: number | null = null;
  let lastPath: string | null = null;
  // `findReactClient` sweeps Steam's whole module registry, and reinject runs
  // several times a second; the module it finds does not change within a context.
  let client: ReactClientModule | undefined;
  // Settle timeouts already scheduled still fire after stop; they must not mount again.
  let stopped = false;

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
  }

  /** Resolve the current navigation path from the browser manager or window location. */
  function getCurrentPath(): string {
    const manager =
      (deskWin as unknown as WindowWithManager).MainWindowBrowserManager ||
      (window as unknown as WindowWithManager).MainWindowBrowserManager;
    return manager?.m_lastLocation?.pathname || deskWin.location.pathname;
  }

  function reinject() {
    if (stopped) return;
    const path = getCurrentPath();
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

    let roots: ReactClientModule | undefined;
    if (GameView || PlayButton) {
      client ??= findReactClient();
      if (!client) {
        return;
      }
      roots = client;
    }

    // Locate play bar and content container
    const { playBarTop, container } = findPlayBarAndContainer(steamPanel, playSection);

    // A GameView left from another game, or outside the container, is torn down
    // BEFORE this pass adapts the page: the teardown restores everything the
    // ledger holds, so after the adaptations it would undo them all.
    let substitute = existingSubstitute;
    if (
      substitute &&
      !(substitute.isConnected && substitute.dataset.appid === String(appId) && substitute.parentElement === container)
    ) {
      unmountCurrent();
      substitute = null;
    }

    // 1. Hide native content sections (non-Steam placeholder, notes, screenshots)
    if (GameView) {
      for (const sec of findSteamContentSections(steamPanel, playSection)) {
        ledger.hide(sec);
      }
    }

    // 2. Replace native Play button in playSection with our PlayButton
    const nativePlayBtn = findSteamPlayButton(playSection);
    if (PlayButton && roots && nativePlayBtn) {
      ledger.hide(nativePlayBtn);

      let playBtnHost = d.getElementById(TENDER_PLAY_BUTTON_ID);
      const needsPlayBtnMount =
        !playBtnHost ||
        !playBtnHost.isConnected ||
        playBtnHost.dataset.appid !== String(appId) ||
        (nativePlayBtn.parentElement !== null && playBtnHost.parentElement !== nativePlayBtn.parentElement);

      if (needsPlayBtnMount) {
        if (playBtnHost) {
          playBtnHost.remove();
        }

        playBtnHost = d.createElement("div");
        playBtnHost.id = TENDER_PLAY_BUTTON_ID;
        playBtnHost.dataset.appid = String(appId);
        playBtnHost.style.overflow = "visible";
        playBtnHost.style.position = "relative";
        playBtnHost.style.zIndex = "20";
        playBtnHost.style.paddingBottom = "2px";

        if (nativePlayBtn.parentElement) {
          nativePlayBtn.parentElement.insertBefore(playBtnHost, nativePlayBtn);
        }

        try {
          const pbRoot = roots.createRoot(playBtnHost);
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
    if (stickyController && !stickyController.matches(playBarTop, playSection)) {
      stickyController.dispose();
      stickyController = null;
    }
    if (!stickyController) {
      stickyController = createStickyPlayBarController(playBarTop, playSection, ledger, container, steamPanel);
    } else {
      stickyController.updatePinning();
    }

    // 4. Ensure hero wrapper overflow is visible so background parallax and card refraction persist during scroll
    const scroller = findScrollContainer(playBarTop);
    const heroWrapper =
      findInflatedHeroWrapper(container, playBarTop, scroller) || findHeroWrapperFallback(steamPanel, playBarTop);
    if (heroWrapper && heroWrapper.style.overflow !== "visible") {
      ledger.style(heroWrapper, "overflow", "visible");
    }

    // 5. Hide Steam's duplicate sticky header
    const duplicateSticky = findSteamStickyPlayBar(d, playBarTop);
    if (duplicateSticky) {
      ledger.hide(duplicateSticky);
    }

    // 6. Hide native play bar badges (Last Played, Playtime, Cloud Status, etc.)
    if (PlayButton) {
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
    }

    // 7. Pin Steam's right-side controls container to the right edge
    const rightControls = findSteamRightControls(playBarTop) ?? findSteamRightControls(playSection);
    if (rightControls) {
      ledger.style(rightControls, "margin-left", "auto");
    }

    // Set before the guard: what the passes above recorded is restored on leaving
    // this page even when no GameView is mounted.
    activeAppId = appId;

    // 8. The substitute mount guard: a GameView for this game is already in place
    if (!GameView || !roots || substitute) {
      return;
    }
    const insertParent = container;
    const insertBeforeRef = playBarTop.nextElementSibling as HTMLElement | null;

    // 9. Mount GameView immediately after the play bar
    const host = d.createElement("div");
    host.id = TENDER_SUBSTITUTE_ID;
    host.className = "tender-desktop-cards-container";
    host.dataset.appid = String(appId);
    host.style.position = "relative";
    host.style.zIndex = "1";

    if (insertBeforeRef && insertBeforeRef.parentElement === insertParent) {
      insertParent.insertBefore(host, insertBeforeRef);
    } else {
      insertParent.appendChild(host);
    }

    try {
      const gvRoot = roots.createRoot(host);
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
    const p = getCurrentPath();
    const appId = appIdOf(p);
    const isRomM = appId ? isRomMAppId(appId) : false;
    const substitute = d.getElementById(TENDER_SUBSTITUTE_ID);
    const playBtn = d.getElementById(TENDER_PLAY_BUTTON_ID);
    const isMountedForCurrent =
      (!GameView || substitute?.dataset.appid === String(appId)) &&
      (!PlayButton || playBtn?.dataset.appid === String(appId));

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
    stopped = true;
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

export function startDesktopNavigationWatcher(page: DesktopGamePage, customWin?: Window): () => void {
  stopDesktopNavigationWatcher();

  if (customWin) {
    if (typeof customWin.setInterval !== "function") {
      return () => {};
    }
    const stop = attachToDesktopWindow(page, customWin);
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
  // Nothing here unregisters the popup callbacks below, so they outlive this
  // supervisor; once it has stopped they must do nothing.
  let supervisorStopped = false;

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
    if (supervisorStopped) return;
    const foundWin = findDesktopWindow();

    if (currentDeskWin && (currentDeskWin.closed || currentDeskWin !== foundWin)) {
      detachCurrent();
    }

    if (foundWin && !foundWin.closed && currentDeskWin !== foundWin) {
      currentDeskWin = foundWin;
      currentDetach = attachToDesktopWindow(page, foundWin);
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
    supervisorStopped = true;
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
