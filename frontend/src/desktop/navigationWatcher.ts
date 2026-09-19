/**
 * Navigation watcher and DOM injector for Steam's Desktop client.
 *
 * In desktop mode, page navigation changes `MainWindowBrowserManager.m_lastLocation`.
 * Because the DOM is constructed asynchronously after the location change, both a
 * polling check on `m_lastLocation` and a `win.MutationObserver` (sourced from the
 * desktop window's own realm) are used to detect and mount on RomM shortcut pages.
 */

import { createElement } from "react";
import type { Root } from "react-dom/client";
import {
  appActionButtonClasses,
  appDetailsClasses,
  basicAppDetailsSectionStylerClasses,
  playSectionClasses,
} from "../utils/deckyUiInternals";
import { isRomMAppId, onRomMAppIdsChanged } from "../utils/rommAppIds";
import { findDesktopWindow, findReactClient } from "./desktopWindow";
import { GameView } from "./gameview/GameView";
import { PlayButton, ensurePulseStyles } from "./gameview/PlayButton";

export const TENDER_SUBSTITUTE_ID = "tender-desktop-substitute";
export const TENDER_PLAY_BUTTON_ID = "tender-desktop-play-button";

interface MainWindowBrowserManagerStub {
  m_lastLocation?: {
    pathname?: string;
  };
}

interface WindowWithManager extends Window {
  MainWindowBrowserManager?: MainWindowBrowserManagerStub;
}

export function appIdOf(path: string | undefined | null): number | null {
  if (!path) return null;
  const match = /\/library\/app\/(\d+)/.exec(path);
  return match ? Number(match[1]) : null;
}

/**
 * Locate Steam's native overview panel within the document.
 * Tries the resolved CSS module class from @decky/ui first, then falls back to a substring
 * class match to guard against uninitialized webpack modules or class name variations.
 */
export function findSteamOverviewPanel(doc: Document): HTMLElement | null {
  const ovClass = appDetailsClasses?.AppDetailsOverviewPanel;
  if (ovClass) {
    const el = doc.querySelector(`.${ovClass}:not(#${TENDER_SUBSTITUTE_ID})`);
    if (el) return el as HTMLElement;
  }
  return doc.querySelector(`[class*="AppDetailsOverviewPanel"]:not(#${TENDER_SUBSTITUTE_ID})`) as HTMLElement | null;
}

/**
 * Helper to find the direct child of `parent` that is or contains `descendant`.
 */
export function getDirectChild(parent: HTMLElement, descendant: HTMLElement): HTMLElement {
  let curr: HTMLElement = descendant;
  while (curr.parentElement && curr.parentElement !== parent) {
    curr = curr.parentElement;
  }
  return curr;
}

export function isPlayBarElement(el: HTMLElement): boolean {
  if (playSectionClasses?.PlayBar && el.classList.contains(playSectionClasses.PlayBar)) return true;
  if (appDetailsClasses?.PlayBar && el.classList.contains(appDetailsClasses.PlayBar)) return true;
  if (
    basicAppDetailsSectionStylerClasses?.PlaySection &&
    el.classList.contains(basicAppDetailsSectionStylerClasses.PlaySection)
  )
    return true;
  if (el.className && typeof el.className === "string" && /\b(PlayBar|PlaySection)\b/i.test(el.className)) return true;
  return false;
}

/**
 * Locate Steam's native play section / action bar (middle bar).
 * Checks @decky/ui classes, common class substrings, and button fallbacks.
 */
export function findSteamPlaySection(root: HTMLElement | Document): HTMLElement | null {
  const psClass = basicAppDetailsSectionStylerClasses?.PlaySection;
  if (psClass) {
    const el = root.querySelector<HTMLElement>(`.${psClass}`);
    if (el) return el;
  }
  const pbClass1 = playSectionClasses?.PlayBar;
  if (pbClass1) {
    const el = root.querySelector<HTMLElement>(`.${pbClass1}`);
    if (el) return el;
  }
  const pbClass2 = appDetailsClasses?.PlayBar;
  if (pbClass2) {
    const el = root.querySelector<HTMLElement>(`.${pbClass2}`);
    if (el) return el;
  }
  const contClass = playSectionClasses?.Container;
  if (contClass) {
    const el = root.querySelector<HTMLElement>(`.${contClass}`);
    if (el) return el;
  }
  const actionClass = playSectionClasses?.ActionSection;
  if (actionClass) {
    const el = root.querySelector<HTMLElement>(`.${actionClass}`);
    if (el) return el;
  }
  const directMatch = root.querySelector<HTMLElement>(
    '[class*="PlaySection"], [class*="PlayBar"], [class*="playsection"], [class*="playbar"], [class*="ActionButtonAndStatusPanel"]',
  );
  if (directMatch) return directMatch;

  // Fallback: locate via the play button itself and walk up to action container
  const btn = root.querySelector<HTMLElement>(
    '[class*="AppActionButton"], [class*="PlayButton"], button[class*="play" i]',
  );
  if (btn) {
    const docBody = root.ownerDocument ? root.ownerDocument.body : (root as Document).body;
    let curr = btn;
    while (curr.parentElement && curr.parentElement !== root && curr.parentElement !== docBody) {
      if (curr.parentElement.children.length > 1 || /play|action/i.test(curr.parentElement.className)) {
        return curr.parentElement;
      }
      curr = curr.parentElement;
    }
    return curr;
  }

  // Final fallback: if root is an HTMLElement with multiple children, the first child is the top action bar
  if ("children" in root && (root as HTMLElement).children.length >= 2) {
    return (root as HTMLElement).firstElementChild as HTMLElement;
  }

  return null;
}

/**
 * Locate Steam's native play button or its container within the play section.
 */
export function findSteamPlayButton(root: HTMLElement | Document): HTMLElement | null {
  const pbcClass = appActionButtonClasses?.PlayButtonContainer;
  if (pbcClass) {
    const el = root.querySelector<HTMLElement>(`.${pbcClass}`);
    if (el) return el;
  }
  const pbClass = appActionButtonClasses?.PlayButton;
  if (pbClass) {
    const el = root.querySelector<HTMLElement>(`.${pbClass}`);
    if (el) {
      if (el.parentElement && /PlayButtonContainer|AppActionButton/i.test(el.parentElement.className)) {
        return el.parentElement;
      }
      return el;
    }
  }
  const btn = root.querySelector<HTMLElement>(
    '[class*="PlayButtonContainer"], [class*="playbuttoncontainer"], [class*="PlayButton"], [class*="AppActionButton"], button[class*="play" i]',
  );
  if (btn) {
    if (btn.parentElement && /PlayButtonContainer/i.test(btn.parentElement.className)) {
      return btn.parentElement;
    }
    return btn;
  }
  return null;
}

/**
 * Locate the play bar element and the common content container that holds both
 * the play bar and the content sections (dashed shortcut notice, notes, screenshots).
 */
export function findPlayBarAndContainer(
  overviewPanel: HTMLElement,
  playSection: HTMLElement,
): { playBarTop: HTMLElement; container: HTMLElement } {
  // If playSection is outside overviewPanel
  if (!overviewPanel.contains(playSection)) {
    return { playBarTop: playSection, container: overviewPanel.parentElement || overviewPanel };
  }

  // First, check if playSection or one of its ancestors inside overviewPanel is explicitly recognized as the PlayBar
  let curr: HTMLElement | null = playSection;
  let recognizedPlayBar: HTMLElement | null = null;
  while (curr && curr !== overviewPanel && curr !== overviewPanel.parentElement) {
    if (isPlayBarElement(curr)) {
      recognizedPlayBar = curr;
    }
    curr = curr.parentElement;
  }

  if (recognizedPlayBar?.parentElement && overviewPanel.contains(recognizedPlayBar.parentElement)) {
    return { playBarTop: recognizedPlayBar, container: recognizedPlayBar.parentElement };
  }

  // Structural discovery: walk down from overviewPanel towards playSection.
  // overviewPanel often wraps an inner container (e.g. Container Glassy).
  // If an ancestor has no siblings in its parent, it is an outer wrapper, so we drill down
  // until we find the level where the play bar has subsequent siblings (the content sections).
  let container: HTMLElement = overviewPanel;
  let playBarTop: HTMLElement = getDirectChild(container, playSection);

  while (
    !playBarTop.nextElementSibling &&
    playBarTop !== playSection &&
    overviewPanel.contains(playBarTop) &&
    playBarTop.children.length > 0
  ) {
    const deeper = getDirectChild(playBarTop, playSection);
    if (deeper === playBarTop) break;
    container = playBarTop;
    playBarTop = deeper;
  }

  return { playBarTop, container };
}

/**
 * Locate the content sections to hide (the lower non-Steam placeholder area, notes, etc.)
 * while preserving the native play section.
 */
export function findSteamContentSections(overviewPanel: HTMLElement, playSection: HTMLElement | null): HTMLElement[] {
  if (!playSection) {
    return [];
  }

  const { playBarTop } = findPlayBarAndContainer(overviewPanel, playSection);
  const toHide = new Set<HTMLElement>();

  // 1. Collect all siblings of playBarTop that come after playBarTop in the container
  let next = playBarTop.nextElementSibling as HTMLElement | null;
  while (next) {
    if (next.id !== TENDER_SUBSTITUTE_ID) {
      toHide.add(next);
    }
    next = next.nextElementSibling as HTMLElement | null;
  }

  // 2. Also explicitly target known non-Steam / desktop content containers
  const explicitSelectors = [
    '[class*="ColumnContainer"]',
    '[class*="RightColumn"]',
    '[class*="ShortcutContainer"]',
    '[class*="Shortcut"]',
    '[class*="AppDetailSectionList"]',
    '[class*="AppDetailsContent"]',
  ];
  for (const selector of explicitSelectors) {
    const matches = overviewPanel.querySelectorAll<HTMLElement>(selector);
    for (const el of Array.from(matches)) {
      if (el.id !== TENDER_SUBSTITUTE_ID && !el.contains(playSection) && !el.contains(playBarTop)) {
        toHide.add(el);
      }
    }
  }

  // If playSection is outside overviewPanel and no elements collected, overviewPanel is the target
  if (toHide.size === 0 && !overviewPanel.contains(playSection)) {
    toHide.add(overviewPanel);
  }

  return Array.from(toHide);
}

/**
 * Test whether an element belongs to the Tender plugin UI.
 */
export function isTenderElement(el: HTMLElement): boolean {
  if (el.id === TENDER_PLAY_BUTTON_ID || el.id === TENDER_SUBSTITUTE_ID) return true;
  if (el.closest(`#${TENDER_PLAY_BUTTON_ID}, #${TENDER_SUBSTITUTE_ID}`)) return true;
  if (typeof el.className === "string" && el.className.includes("tender-")) return true;
  return false;
}

/**
 * Test whether an element represents or contains Steam's right-side control buttons
 * (Settings gear, Controller layout, Favorite).
 */
export function isRightControlsElement(el: HTMLElement): boolean {
  if (
    (playSectionClasses?.RightControls && el.classList.contains(playSectionClasses.RightControls)) ||
    (playSectionClasses?.AppButtonsContainer && el.classList.contains(playSectionClasses.AppButtonsContainer)) ||
    (basicAppDetailsSectionStylerClasses?.AppButtons &&
      el.classList.contains(basicAppDetailsSectionStylerClasses.AppButtons))
  ) {
    return true;
  }
  if (typeof el.className === "string") {
    if (
      /\b(RightControls|AppButtons|AppButtonsContainer|ControllerConfig|FavoriteButton|GameInfoButton)\b/i.test(
        el.className,
      )
    ) {
      return true;
    }
  }
  if (
    el.querySelector(
      '[class*="RightControls"], [class*="AppButtons"], [class*="ControllerConfig"], [class*="FavoriteButton"]',
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Locate Steam's native status / activity / playtime / last played badges on the play bar
 * that should be hidden in favor of Tender's custom badges.
 */
export function findSteamPlayBarBadges(root: HTMLElement, nativePlayBtn?: HTMLElement | null): HTMLElement[] {
  const badges = new Set<HTMLElement>();

  const isTender = (el: HTMLElement): boolean => isTenderElement(el);
  const isRightControls = (el: HTMLElement): boolean => isRightControlsElement(el);
  const isPlayBtn = (el: HTMLElement): boolean => {
    if (!nativePlayBtn) return false;
    return el === nativePlayBtn || el.contains(nativePlayBtn) || nativePlayBtn.contains(el);
  };

  const isExcluded = (el: HTMLElement): boolean => isTender(el) || isRightControls(el) || isPlayBtn(el);

  // 1. Primary badge / stats container: StatusAndStats, GameStatsSection
  const containerSelectors = [
    playSectionClasses?.StatusAndStats ? `.${playSectionClasses.StatusAndStats}` : null,
    playSectionClasses?.GameStatsSection ? `.${playSectionClasses.GameStatsSection}` : null,
    '[class*="StatusAndStats"]',
    '[class*="GameStatsSection"]',
  ].filter(Boolean) as string[];

  for (const sel of containerSelectors) {
    const matches = root.querySelectorAll<HTMLElement>(sel);
    for (const el of Array.from(matches)) {
      if (!isExcluded(el)) {
        badges.add(el);
      }
    }
  }

  // 2. Individual stat / badge items: LastPlayed, Playtime, CloudStatus, MiniAchievements, etc.
  const itemSelectors = [
    playSectionClasses?.GameStat ? `.${playSectionClasses.GameStat}` : null,
    playSectionClasses?.LastPlayed ? `.${playSectionClasses.LastPlayed}` : null,
    playSectionClasses?.LastPlayedInfo ? `.${playSectionClasses.LastPlayedInfo}` : null,
    playSectionClasses?.Playtime ? `.${playSectionClasses.Playtime}` : null,
    playSectionClasses?.CloudStatusRow ? `.${playSectionClasses.CloudStatusRow}` : null,
    playSectionClasses?.MiniAchievements ? `.${playSectionClasses.MiniAchievements}` : null,
    playSectionClasses?.AchievementProgressRow ? `.${playSectionClasses.AchievementProgressRow}` : null,
    playSectionClasses?.DetailsSectionStatus ? `.${playSectionClasses.DetailsSectionStatus}` : null,
    '[class*="GameStat"]',
    '[class*="LastPlayed"]',
    '[class*="Playtime"]',
    '[class*="CloudStatus"]',
    '[class*="MiniAchievements"]',
    '[class*="AchievementProgress"]',
  ].filter(Boolean) as string[];

  for (const sel of itemSelectors) {
    const matches = root.querySelectorAll<HTMLElement>(sel);
    for (const el of Array.from(matches)) {
      if (!isExcluded(el)) {
        badges.add(el);
      }
    }
  }

  // 3. Elements labeled PlayBarDetailLabel / PlayBarLabel
  const labelSelectors = [
    playSectionClasses?.PlayBarDetailLabel ? `.${playSectionClasses.PlayBarDetailLabel}` : null,
    playSectionClasses?.PlayBarLabel ? `.${playSectionClasses.PlayBarLabel}` : null,
    '[class*="PlayBarDetailLabel"]',
    '[class*="PlayBarLabel"]',
  ].filter(Boolean) as string[];

  for (const sel of labelSelectors) {
    const matches = root.querySelectorAll<HTMLElement>(sel);
    for (const el of Array.from(matches)) {
      if (!isExcluded(el)) {
        const parent = el.closest<HTMLElement>('[class*="GameStat"]') || el.parentElement;
        if (parent && parent !== root && !isExcluded(parent)) {
          badges.add(parent);
        } else {
          badges.add(el);
        }
      }
    }
  }

  // 4. Text-matching fallback for unhashed or theme-styled badge labels
  const allElements = root.querySelectorAll<HTMLElement>("div, span");
  for (const el of Array.from(allElements)) {
    if (isExcluded(el)) continue;
    const txt = el.textContent.trim().toUpperCase();
    if (txt === "LAST PLAYED" || txt === "PLAYTIME") {
      const parent = el.closest<HTMLElement>('[class*="GameStat"]') || el.parentElement;
      if (parent && parent !== root && !isExcluded(parent)) {
        badges.add(parent);
      } else {
        badges.add(el);
      }
    }
  }

  return Array.from(badges);
}

/**
 * Locate Steam's right-side control buttons container (Settings gear, Controller layout, Favorite)
 * within the play bar so it can be pinned to the right edge.
 */
export function findSteamRightControls(root: HTMLElement): HTMLElement | null {
  const selectors = [
    playSectionClasses?.RightControls ? `.${playSectionClasses.RightControls}` : null,
    playSectionClasses?.AppButtonsContainer ? `.${playSectionClasses.AppButtonsContainer}` : null,
    basicAppDetailsSectionStylerClasses?.AppButtons ? `.${basicAppDetailsSectionStylerClasses.AppButtons}` : null,
    '[class*="RightControls"]',
    '[class*="AppButtonsContainer"]',
    '[class*="AppButtons"]',
  ].filter(Boolean) as string[];

  for (const sel of selectors) {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && !isTenderElement(el)) {
      let topEl = el;
      while (
        topEl.parentElement &&
        topEl.parentElement !== root &&
        isRightControlsElement(topEl.parentElement) &&
        !isTenderElement(topEl.parentElement)
      ) {
        topEl = topEl.parentElement;
      }
      return topEl;
    }
  }

  // Fallback: look for elements containing controller config or favorite button
  const fallbackMatch = root.querySelector<HTMLElement>('[class*="ControllerConfig"], [class*="FavoriteButton"]');
  if (fallbackMatch && !isTenderElement(fallbackMatch)) {
    let parent: HTMLElement = fallbackMatch;
    while (parent.parentElement && parent.parentElement !== root && !isTenderElement(parent.parentElement)) {
      if (isRightControlsElement(parent.parentElement)) {
        parent = parent.parentElement;
      } else {
        break;
      }
    }
    return parent;
  }

  return null;
}

let activeWatcherStop: (() => void) | null = null;

export function startDesktopNavigationWatcher(customWin?: Window): () => void {
  stopDesktopNavigationWatcher();

  const win = customWin || findDesktopWindow();
  if (!win || typeof win.setInterval !== "function") {
    return () => {};
  }

  const deskWin = win;
  const d = deskWin.document;
  let activeRoot: Root | null = null;
  let activePlayButtonRoot: Root | null = null;
  let hiddenPlayButton: HTMLElement | null = null;
  let hiddenBadges: HTMLElement[] = [];
  let styledRightControls: HTMLElement | null = null;
  let hiddenElements: HTMLElement[] = [];
  let lastPath: string | null = null;

  function unmountCurrent() {
    if (activeRoot) {
      try {
        activeRoot.unmount();
      } catch {
        // Ignored
      }
      activeRoot = null;
    }
    if (activePlayButtonRoot) {
      try {
        activePlayButtonRoot.unmount();
      } catch {
        // Ignored
      }
      activePlayButtonRoot = null;
    }
    const existing = d.getElementById(TENDER_SUBSTITUTE_ID);
    if (existing) {
      existing.remove();
    }
    const existingPlayBtn = d.getElementById(TENDER_PLAY_BUTTON_ID);
    if (existingPlayBtn) {
      existingPlayBtn.remove();
    }
    if (hiddenPlayButton && hiddenPlayButton.isConnected) {
      hiddenPlayButton.style.display = "";
    }
    hiddenPlayButton = null;
    for (const el of hiddenBadges) {
      if (el.isConnected) {
        el.style.display = "";
      }
    }
    hiddenBadges = [];
    if (styledRightControls && styledRightControls.isConnected) {
      styledRightControls.style.marginLeft = "";
    }
    styledRightControls = null;
    for (const el of hiddenElements) {
      if (el.isConnected) {
        el.style.display = "";
      }
    }
    hiddenElements = [];

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
    const appId = appIdOf(path);

    const existing = d.getElementById(TENDER_SUBSTITUTE_ID);

    // If not a RomM game or not on an app route, clean up any active mount
    if (!appId || !isRomMAppId(appId)) {
      if (existing || activeRoot || activePlayButtonRoot) {
        unmountCurrent();
      }
      return;
    }

    // Ensure desktop styles (including download pulsing keyframes) are present in desktop document
    ensurePulseStyles(d);

    // Locate Steam's native overview panel
    const steamPanel = findSteamOverviewPanel(d);
    if (!steamPanel || !steamPanel.parentElement) {
      // Steam hasn't constructed the game overview panel in the DOM yet.
      return;
    }

    // Locate Steam's native play section
    const playSection = findSteamPlaySection(steamPanel) || findSteamPlaySection(d);
    if (!playSection) {
      // Steam hasn't rendered the action bar / play button yet.
      // Wait for MutationObserver or polling interval to fire once ready.
      return;
    }

    // Ensure steamPanel itself is not hidden (we preserve the play bar inside it)
    if (steamPanel.contains(playSection) && steamPanel.style.display === "none") {
      steamPanel.style.display = "";
    }

    const client = findReactClient();
    if (!client) {
      return;
    }

    // Replace native Play button in playSection with our PlayButton
    const nativePlayBtn = findSteamPlayButton(playSection);
    if (nativePlayBtn) {
      if (hiddenPlayButton !== nativePlayBtn) {
        if (hiddenPlayButton && hiddenPlayButton.isConnected) {
          hiddenPlayButton.style.display = "";
        }
        hiddenPlayButton = nativePlayBtn;
      }
      if (nativePlayBtn.style.display !== "none") {
        nativePlayBtn.style.display = "none";
      }

      let playBtnHost = d.getElementById(TENDER_PLAY_BUTTON_ID);
      const needsPlayBtnMount =
        !playBtnHost ||
        !playBtnHost.isConnected ||
        playBtnHost.dataset.appid !== String(appId) ||
        !activePlayButtonRoot;

      if (needsPlayBtnMount) {
        if (activePlayButtonRoot) {
          try {
            activePlayButtonRoot.unmount();
          } catch {
            // Ignored
          }
          activePlayButtonRoot = null;
        }
        if (playBtnHost) {
          playBtnHost.remove();
        }

        playBtnHost = d.createElement("div");
        playBtnHost.id = TENDER_PLAY_BUTTON_ID;
        playBtnHost.dataset.appid = String(appId);
        playBtnHost.style.overflow = "visible";

        if (nativePlayBtn.parentElement) {
          nativePlayBtn.parentElement.insertBefore(playBtnHost, nativePlayBtn);
        }

        try {
          ensurePulseStyles(d);
          const pbRoot = client.createRoot(playBtnHost);
          pbRoot.render(createElement(PlayButton, { appId }));
          activePlayButtonRoot = pbRoot;
        } catch {
          // Handled gracefully
        }
      }
    }

    // Locate the play bar top element and its container
    const { playBarTop, container } = findPlayBarAndContainer(steamPanel, playSection);

    // Locate and hide Steam's native play bar badges (Last Played, Playtime, etc.)
    const badgeElements = findSteamPlayBarBadges(playBarTop, nativePlayBtn);
    if (!playBarTop.contains(playSection)) {
      for (const badge of findSteamPlayBarBadges(playSection, nativePlayBtn)) {
        if (!badgeElements.includes(badge)) {
          badgeElements.push(badge);
        }
      }
    }

    // Restore any previously hidden badges that are no longer targeted
    for (const el of hiddenBadges) {
      if (!badgeElements.includes(el) && el.isConnected) {
        el.style.display = "";
      }
    }
    hiddenBadges = badgeElements;

    // Hide target badge elements
    for (const el of hiddenBadges) {
      if (el.style.display !== "none") {
        el.style.display = "none";
      }
    }

    // Pin Steam's right-side controls container to the right edge of the play bar
    const rightControls = findSteamRightControls(playBarTop) ?? findSteamRightControls(playSection);
    if (rightControls) {
      if (styledRightControls !== rightControls) {
        if (styledRightControls && styledRightControls.isConnected) {
          styledRightControls.style.marginLeft = "";
        }
        styledRightControls = rightControls;
      }
      if (rightControls.style.marginLeft !== "auto") {
        rightControls.style.marginLeft = "auto";
      }
    } else if (styledRightControls && styledRightControls.isConnected) {
      styledRightControls.style.marginLeft = "";
      styledRightControls = null;
    }

    // Locate content sections to hide (the lower sections, non-Steam notice, notes, recordings, etc.)
    const contentSections = findSteamContentSections(steamPanel, playSection);

    // Restore any previously hidden elements that are no longer targeted
    for (const el of hiddenElements) {
      if (!contentSections.includes(el) && el.isConnected) {
        el.style.display = "";
      }
    }
    hiddenElements = contentSections;

    // Hide target content sections
    for (const el of hiddenElements) {
      if (el.style.display !== "none") {
        el.style.display = "none";
      }
    }

    // Determine insertion target: immediately after the play bar
    const insertParent = container;
    const insertBeforeRef = playBarTop.nextElementSibling as HTMLElement | null;

    // If already mounted for this appId and properly placed, no further action needed
    if (
      existing &&
      existing.isConnected &&
      existing.dataset.appid === String(appId) &&
      existing.parentElement === insertParent
    ) {
      return;
    }

    // Navigated from a different RomM game or repositioning
    if (existing) {
      unmountCurrent();
      // Re-apply hiding on content sections
      for (const el of hiddenElements) {
        if (el.style.display !== "none") {
          el.style.display = "none";
        }
      }
    }

    const host = d.createElement("div");
    host.id = TENDER_SUBSTITUTE_ID;
    host.dataset.appid = String(appId);

    if (insertBeforeRef && insertBeforeRef.parentElement === insertParent) {
      insertParent.insertBefore(host, insertBeforeRef);
    } else {
      insertParent.appendChild(host);
    }

    try {
      const root = client.createRoot(host);
      root.render(createElement(GameView, { appId }));
      activeRoot = root;
    } catch {
      unmountCurrent();
    }
  }

  const checkNav = () => {
    const manager =
      (deskWin as unknown as WindowWithManager).MainWindowBrowserManager ||
      (window as unknown as WindowWithManager).MainWindowBrowserManager;
    const p = manager?.m_lastLocation?.pathname || deskWin.location.pathname;
    if (p !== lastPath) {
      lastPath = p || null;
      reinject();
      if (typeof deskWin.setTimeout === "function") {
        deskWin.setTimeout(reinject, 100);
        deskWin.setTimeout(reinject, 300);
        deskWin.setTimeout(reinject, 600);
      }
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
    win.clearInterval(iv);
    mo.disconnect();
    unlistenAppIds();
    unmountCurrent();
    if (activeWatcherStop === stop) {
      activeWatcherStop = null;
    }
  };

  activeWatcherStop = stop;
  reinject();
  if (typeof deskWin.setTimeout === "function") {
    deskWin.setTimeout(reinject, 100);
    deskWin.setTimeout(reinject, 300);
    deskWin.setTimeout(reinject, 600);
  }
  return stop;
}

export function stopDesktopNavigationWatcher(): void {
  if (activeWatcherStop) {
    activeWatcherStop();
    activeWatcherStop = null;
  }
}
