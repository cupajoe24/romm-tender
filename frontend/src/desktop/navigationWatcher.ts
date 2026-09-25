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
import {
  GLASS_PLAY_BAR_BG,
  GLASS_PLAY_BAR_GRADIENT,
  PINNED_PLAY_BAR_SHADOW,
  SOLID_PLAY_BAR_BG,
} from "./gameview/styles";

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
  const bpMatch = doc.querySelector(
    `[class*="AppDetailsOverviewPanel"]:not(#${TENDER_SUBSTITUTE_ID})`,
  ) as HTMLElement | null;
  if (bpMatch) return bpMatch;

  // Desktop client fallback: Right panel container
  const desktopMatch = doc.querySelector(`[class*="RightPanel"]:not(#${TENDER_SUBSTITUTE_ID})`) as HTMLElement | null;
  if (desktopMatch) {
    const detailChild = desktopMatch.querySelector<HTMLElement>(":scope > div:first-child");
    return detailChild || desktopMatch;
  }

  return null;
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
  if (playSectionClasses?.InPage && el.classList.contains(playSectionClasses.InPage)) return true;
  if (playSectionClasses?.Container && el.classList.contains(playSectionClasses.Container)) return true;
  if (appDetailsClasses?.PlayBar && el.classList.contains(appDetailsClasses.PlayBar)) return true;
  if (
    basicAppDetailsSectionStylerClasses?.PlaySection &&
    el.classList.contains(basicAppDetailsSectionStylerClasses.PlaySection)
  )
    return true;
  if (el.className && typeof el.className === "string" && /\b(PlayBar|PlaySection|InPage)\b/i.test(el.className))
    return true;
  if (
    el.classList.contains("_3fLo166MlaNqP8r8tTyRz") ||
    el.classList.contains("_3Yf8b2v5oOD8Wqsxu04ar") ||
    el.classList.contains("_2L3s2nzh7yCnNESfI5_dN1")
  )
    return true;
  return false;
}

export function getDocument(root: HTMLElement | Document): Document {
  return "ownerDocument" in root && root.ownerDocument ? root.ownerDocument : (root as Document);
}

function findActionContainerFromButton(
  btn: HTMLElement,
  root: HTMLElement | Document,
  docBody: HTMLElement,
): HTMLElement {
  let curr: HTMLElement = btn;
  while (curr.parentElement && curr.parentElement !== root && curr.parentElement !== docBody) {
    if (curr.parentElement.children.length > 1 || /play|action/i.test(curr.parentElement.className)) {
      return curr.parentElement;
    }
    curr = curr.parentElement;
  }
  return curr;
}

/**
 * Locate Steam's native play section / action bar (middle bar).
 * Checks @decky/ui classes, common class substrings, and button fallbacks.
 */
export function findSteamPlaySection(root: HTMLElement | Document): HTMLElement | null {
  const doc = getDocument(root);
  const docBody = doc.body;

  const playBtn = findSteamPlayButton(root);
  if (playBtn) {
    const section = playBtn.closest(
      '[class*="PlaySection"], [class*="PlayBar"], [class*="playsection"], [class*="playbar"], [class*="ActionButtonAndStatusPanel"]',
    ) as HTMLElement | null;
    if (section) return section;

    // Desktop fallback: walk up from playBtn until reaching a container with sibling action controls (options, etc.)
    return findActionContainerFromButton(playBtn, root, docBody);
  }

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
    return findActionContainerFromButton(btn, root, docBody);
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

  // Desktop client fallback: find element whose direct text is "Play" (case-insensitive)
  const doc = getDocument(root);
  const searchRoot = "querySelectorAll" in root ? root : doc;
  const candidates = searchRoot.querySelectorAll<HTMLElement>("div, button");
  for (const candidate of Array.from(candidates)) {
    if (candidate.children.length === 0 && candidate.textContent.trim().toUpperCase() === "PLAY") {
      const focusable = candidate.closest<HTMLElement>('[class*="Focusable"], [class*="Panel"]') ?? candidate;
      return focusable;
    }
  }

  return null;
}

/**
 * Helper to check if an element or its descendants contain Steam's content sections.
 */
export function containsContentSections(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  const explicitSelectors = [
    '[class*="ColumnContainer"]',
    '[class*="RightColumn"]',
    '[class*="ShortcutContainer"]',
    '[class*="Shortcut"]',
    '[class*="AppDetailSectionList"]',
    '[class*="AppDetailsContent"]',
  ];
  for (const sel of explicitSelectors) {
    if (el.matches(sel) || el.querySelector(sel) !== null) return true;
  }
  return false;
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

  // If recognizedPlayBar is wrapped in an inner play section container (e.g. playSectionClasses.Container / InPage)
  // that sits within an outer content container alongside subsequent content sections (ColumnContainer, etc.),
  // elevate recognizedPlayBar to that wrapper so that Tender's substitute is mounted as a sibling of the play section
  // in the scrollable content container, rather than trapped inside the in-page play bar wrapper which Steam fades
  // out (opacity: 0) when the play bar reaches the sticky header position on scroll.
  while (
    recognizedPlayBar?.parentElement &&
    recognizedPlayBar.parentElement !== overviewPanel &&
    overviewPanel.contains(recognizedPlayBar.parentElement) &&
    (isPlayBarElement(recognizedPlayBar.parentElement) ||
      (!containsContentSections(recognizedPlayBar.parentElement) &&
        recognizedPlayBar.parentElement.parentElement &&
        overviewPanel.contains(recognizedPlayBar.parentElement.parentElement) &&
        containsContentSections(recognizedPlayBar.parentElement.parentElement)))
  ) {
    recognizedPlayBar = recognizedPlayBar.parentElement;
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
 * Locate Steam's native duplicate sticky play bar / header that appears when scrolling down.
 * In desktop Steam, this element sits outside AppDetailsOverviewPanel (under the main window split),
 * so it must be queried across the document or ownerDocument, rather than strictly inside the overview panel.
 */
export function findSteamStickyPlayBar(root: Document | HTMLElement, playBarTop: HTMLElement): HTMLElement | null {
  const doc = getDocument(root);
  const isCandidate = (el: HTMLElement | null): el is HTMLElement => {
    if (!el) return false;
    if (el === playBarTop || playBarTop.contains(el) || el.contains(playBarTop)) return false;
    if (isTenderElement(el)) return false;
    return true;
  };

  // 1. Check exact PlayBar class from appDetailsClasses across the document
  const appDetailsPb = appDetailsClasses?.PlayBar;
  if (appDetailsPb) {
    const matches = doc.querySelectorAll<HTMLElement>(`.${appDetailsPb}`);
    for (const el of Array.from(matches)) {
      if (isCandidate(el)) return el;
    }
  }

  // 2. Check StickyHeader class from playSectionClasses across the document
  const stickyHeaderClass = playSectionClasses?.StickyHeader;
  if (stickyHeaderClass) {
    const matches = doc.querySelectorAll<HTMLElement>(`.${stickyHeaderClass}`);
    for (const el of Array.from(matches)) {
      if (isCandidate(el)) {
        let topSticky = el;
        while (
          topSticky.parentElement &&
          topSticky.parentElement !== doc.body &&
          isCandidate(topSticky.parentElement) &&
          (topSticky.parentElement.classList.contains(appDetailsPb || "") ||
            /sticky|playbar/i.test(topSticky.parentElement.className))
        ) {
          topSticky = topSticky.parentElement;
        }
        return topSticky;
      }
    }
  }

  // 3. Check ShowPlayBar class from appDetailsClasses
  const showPlayBarClass = appDetailsClasses?.ShowPlayBar;
  if (showPlayBarClass) {
    const matches = doc.querySelectorAll<HTMLElement>(`.${showPlayBarClass}`);
    for (const el of Array.from(matches)) {
      if (isCandidate(el)) return el;
    }
  }

  // 4. Fallback: search for elements with PlayBar or StickyHeader in their class name
  const candidates = doc.querySelectorAll<HTMLElement>(
    'div[class*="PlayBar"], div[class*="playbar"], div[class*="StickyHeader"], div[class*="stickyheader"]',
  );
  for (const el of Array.from(candidates)) {
    if (isCandidate(el)) {
      let topSticky = el;
      while (
        topSticky.parentElement &&
        topSticky.parentElement !== doc.body &&
        isCandidate(topSticky.parentElement) &&
        /sticky|playbar/i.test(topSticky.parentElement.className)
      ) {
        topSticky = topSticky.parentElement;
      }
      return topSticky;
    }
  }

  return null;
}

/**
 * Locate the scrollable container for an element (e.g. Steam's game overview scroller).
 * Returns the scrollable element if found, or the window.
 */
export function findScrollContainer(el: HTMLElement): HTMLElement | Window {
  const win = el.ownerDocument.defaultView || window;
  let curr = el.parentElement;
  while (curr && curr !== el.ownerDocument.body) {
    const style = win.getComputedStyle(curr);
    const ov = style.overflowY;
    if (ov === "auto" || ov === "scroll") {
      return curr;
    }
    curr = curr.parentElement;
  }
  return win;
}

/**
 * Locate the hero/banner wrapper whose overflowing canvas children inflate the
 * scroll container's scrollHeight, causing a large empty gap at the bottom.
 *
 * Walks the ancestors of `container` (the content container holding the play bar
 * and Tender substitute) up to `scroller` looking for a sibling element whose
 * `scrollHeight` significantly exceeds its `offsetHeight`.  That sibling is the
 * hero banner wrapper containing absolutely-positioned or inline canvas elements
 * that overflow their container.  Setting `overflow: hidden` on it clips the
 * overflow and keeps the scrollbar matched to the actual content height.
 *
 * Returns `null` when no inflated sibling can be found.
 */
export function findInflatedHeroWrapper(
  container: HTMLElement,
  playBarTop: HTMLElement,
  scroller: HTMLElement | Window,
): HTMLElement | null {
  const scrollerEl =
    "nodeType" in scroller && (scroller as HTMLElement).nodeType === 1 ? (scroller as HTMLElement) : null;
  let curr: HTMLElement = container;

  while (curr !== scrollerEl) {
    const parent: HTMLElement | null = curr.parentElement;
    if (!parent) break;

    for (const sibling of Array.from(parent.children) as HTMLElement[]) {
      if (sibling === curr) continue;
      if (isTenderElement(sibling)) continue;
      if (sibling.contains(playBarTop)) continue;

      // An element whose scrollHeight exceeds its offsetHeight by more than 200px
      // is overflowing due to absolutely-positioned or inline canvas/img children.
      if (sibling.scrollHeight > sibling.offsetHeight + 200) {
        return sibling;
      }
    }

    if (parent === scrollerEl) break;
    curr = parent;
  }

  return null;
}

/**
 * Determine whether a sticky play bar is currently pinned to the top of its scroll container.
 */
export function isPlayBarPinned(playBarTop: HTMLElement, scroller: HTMLElement | Window): boolean {
  const pbRect = playBarTop.getBoundingClientRect();
  const scRect =
    "nodeType" in scroller && (scroller as HTMLElement).nodeType === 1
      ? (scroller as HTMLElement).getBoundingClientRect()
      : { top: 0 };
  return pbRect.top <= scRect.top + 1;
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
    if (next.id !== TENDER_SUBSTITUTE_ID && !isTenderElement(next)) {
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
      if (
        el.id !== TENDER_SUBSTITUTE_ID &&
        !isTenderElement(el) &&
        !el.contains(playSection) &&
        !el.contains(playBarTop) &&
        !playBarTop.contains(el)
      ) {
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
let supervisorInterval: number | null = null;

function attachToDesktopWindow(deskWin: Window): () => void {
  const d = deskWin.document;
  let activeRoot: Root | null = null;
  let activePlayButtonRoot: Root | null = null;
  let hiddenPlayButton: HTMLElement | null = null;
  let hiddenBadges: HTMLElement[] = [];
  let styledRightControls: HTMLElement | null = null;
  let styledPlayBar: HTMLElement | null = null;
  let originalPlayBarStyles: {
    position: string;
    top: string;
    zIndex: string;
    opacity: string;
    pointerEvents: string;
    backgroundImage: string;
    backgroundColor: string;
    backdropFilter: string;
    webkitBackdropFilter: string;
    boxShadow: string;
    transition: string;
    paddingBottom: string;
  } | null = null;
  let styledPlaySection: HTMLElement | null = null;
  let originalPlaySectionStyles: {
    backgroundColor: string;
    transition: string;
  } | null = null;
  let activeScrollContainer: EventTarget | null = null;
  let activeScrollListener: (() => void) | null = null;
  let isPlayBarPinnedState: boolean | null = null;
  let hiddenStickyDuplicate: HTMLElement | null = null;
  let styledHeroElement: HTMLElement | null = null;
  let hiddenElements: HTMLElement[] = [];
  let lastPath: string | null = null;

  function applyPlayBarState(pinned: boolean) {
    if (isPlayBarPinnedState === pinned && styledPlayBar) return;
    isPlayBarPinnedState = pinned;

    if (!styledPlayBar) return;

    if (pinned) {
      styledPlayBar.style.backgroundImage = "none";
      styledPlayBar.style.backgroundColor = SOLID_PLAY_BAR_BG;
      styledPlayBar.style.backdropFilter = "none";
      (styledPlayBar.style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter = "none";
      styledPlayBar.style.boxShadow = PINNED_PLAY_BAR_SHADOW;
      if (styledPlaySection && styledPlaySection !== styledPlayBar) {
        styledPlaySection.style.backgroundColor = SOLID_PLAY_BAR_BG;
      }
    } else {
      styledPlayBar.style.backgroundImage = GLASS_PLAY_BAR_GRADIENT;
      styledPlayBar.style.backgroundColor = GLASS_PLAY_BAR_BG;
      styledPlayBar.style.backdropFilter = "blur(12px)";
      (styledPlayBar.style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter = "blur(12px)";
      styledPlayBar.style.boxShadow = "none";
      if (styledPlaySection && styledPlaySection !== styledPlayBar) {
        styledPlaySection.style.backgroundColor = "transparent";
      }
    }
  }

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
    if (activeScrollContainer && activeScrollListener) {
      activeScrollContainer.removeEventListener("scroll", activeScrollListener);
      activeScrollContainer = null;
      activeScrollListener = null;
    }
    isPlayBarPinnedState = null;
    if (styledPlayBar && styledPlayBar.isConnected && originalPlayBarStyles) {
      styledPlayBar.style.position = originalPlayBarStyles.position;
      styledPlayBar.style.top = originalPlayBarStyles.top;
      styledPlayBar.style.zIndex = originalPlayBarStyles.zIndex;
      styledPlayBar.style.opacity = originalPlayBarStyles.opacity;
      styledPlayBar.style.pointerEvents = originalPlayBarStyles.pointerEvents;
      styledPlayBar.style.backgroundImage = originalPlayBarStyles.backgroundImage;
      styledPlayBar.style.backgroundColor = originalPlayBarStyles.backgroundColor;
      styledPlayBar.style.backdropFilter = originalPlayBarStyles.backdropFilter;
      (styledPlayBar.style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter =
        originalPlayBarStyles.webkitBackdropFilter;
      styledPlayBar.style.boxShadow = originalPlayBarStyles.boxShadow;
      styledPlayBar.style.transition = originalPlayBarStyles.transition;
      styledPlayBar.style.paddingBottom = originalPlayBarStyles.paddingBottom;
    }
    styledPlayBar = null;
    originalPlayBarStyles = null;
    if (styledPlaySection && styledPlaySection.isConnected && originalPlaySectionStyles) {
      styledPlaySection.style.backgroundColor = originalPlaySectionStyles.backgroundColor;
      styledPlaySection.style.transition = originalPlaySectionStyles.transition;
    }
    styledPlaySection = null;
    originalPlaySectionStyles = null;
    if (hiddenStickyDuplicate && hiddenStickyDuplicate.isConnected) {
      hiddenStickyDuplicate.style.display = "";
    }
    hiddenStickyDuplicate = null;
    if (styledHeroElement && styledHeroElement.isConnected) {
      styledHeroElement.style.overflow = "";
    }
    styledHeroElement = null;
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
        playBtnHost.style.paddingBottom = "2px";

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
      } else if (playBtnHost && playBtnHost.style.paddingBottom !== "2px") {
        playBtnHost.style.paddingBottom = "2px";
      }
    }

    // Locate the play bar top element and its container
    const { playBarTop, container } = findPlayBarAndContainer(steamPanel, playSection);

    // Isolate play bar as its own container: freeze at top so cards can scroll independently
    if (styledPlayBar !== playBarTop) {
      if (styledPlayBar && styledPlayBar.isConnected && originalPlayBarStyles) {
        styledPlayBar.style.position = originalPlayBarStyles.position;
        styledPlayBar.style.top = originalPlayBarStyles.top;
        styledPlayBar.style.zIndex = originalPlayBarStyles.zIndex;
        styledPlayBar.style.opacity = originalPlayBarStyles.opacity;
        styledPlayBar.style.pointerEvents = originalPlayBarStyles.pointerEvents;
        styledPlayBar.style.backgroundImage = originalPlayBarStyles.backgroundImage;
        styledPlayBar.style.backgroundColor = originalPlayBarStyles.backgroundColor;
        styledPlayBar.style.backdropFilter = originalPlayBarStyles.backdropFilter;
        (styledPlayBar.style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter =
          originalPlayBarStyles.webkitBackdropFilter;
        styledPlayBar.style.boxShadow = originalPlayBarStyles.boxShadow;
        styledPlayBar.style.transition = originalPlayBarStyles.transition;
        styledPlayBar.style.paddingBottom = originalPlayBarStyles.paddingBottom;
      }
      styledPlayBar = playBarTop;
      originalPlayBarStyles = {
        position: playBarTop.style.position,
        top: playBarTop.style.top,
        zIndex: playBarTop.style.zIndex,
        opacity: playBarTop.style.opacity,
        pointerEvents: playBarTop.style.pointerEvents,
        backgroundImage: playBarTop.style.backgroundImage,
        backgroundColor: playBarTop.style.backgroundColor,
        backdropFilter: playBarTop.style.backdropFilter,
        webkitBackdropFilter:
          (playBarTop.style as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || "",
        boxShadow: playBarTop.style.boxShadow,
        transition: playBarTop.style.transition,
        paddingBottom: playBarTop.style.paddingBottom,
      };
      isPlayBarPinnedState = null;
    }
    if (playBarTop.style.position !== "sticky") {
      playBarTop.style.position = "sticky";
    }
    if (playBarTop.style.top !== "0px") {
      playBarTop.style.top = "0px";
    }
    if (playBarTop.style.zIndex !== "10") {
      playBarTop.style.zIndex = "10";
    }
    if (playBarTop.style.opacity !== "1") {
      playBarTop.style.opacity = "1";
    }
    if (playBarTop.style.pointerEvents !== "auto") {
      playBarTop.style.pointerEvents = "auto";
    }
    if (playBarTop.style.paddingBottom !== "2px") {
      playBarTop.style.paddingBottom = "2px";
    }
    if (!playBarTop.style.transition) {
      playBarTop.style.transition = "background-color 0.2s ease, box-shadow 0.2s ease";
    }
    if (playSection !== playBarTop) {
      if (styledPlaySection !== playSection) {
        if (styledPlaySection && styledPlaySection.isConnected && originalPlaySectionStyles) {
          styledPlaySection.style.backgroundColor = originalPlaySectionStyles.backgroundColor;
          styledPlaySection.style.transition = originalPlaySectionStyles.transition;
        }
        styledPlaySection = playSection;
        originalPlaySectionStyles = {
          backgroundColor: playSection.style.backgroundColor,
          transition: playSection.style.transition,
        };
      }
      if (!playSection.style.transition) {
        playSection.style.transition = "background-color 0.2s ease";
      }
    }

    // Attach dynamic scroll watcher to toggle between semi-transparent grey glass and solid grey when pinned
    const scroller = findScrollContainer(playBarTop);
    if (activeScrollContainer !== scroller) {
      if (activeScrollContainer && activeScrollListener) {
        activeScrollContainer.removeEventListener("scroll", activeScrollListener);
      }
      const updatePinning = () => {
        if (!playBarTop.isConnected) return;
        const pinned = isPlayBarPinned(playBarTop, scroller);
        applyPlayBarState(pinned);
      };
      scroller.addEventListener("scroll", updatePinning, { passive: true });
      activeScrollContainer = scroller;
      activeScrollListener = updatePinning;
      updatePinning();
    } else if (activeScrollListener) {
      activeScrollListener();
    }

    // Hide Steam's duplicate sticky header so it doesn't collide with our in-page sticky play bar
    const duplicateSticky = findSteamStickyPlayBar(d, playBarTop);
    if (hiddenStickyDuplicate !== duplicateSticky) {
      if (hiddenStickyDuplicate && hiddenStickyDuplicate.isConnected) {
        hiddenStickyDuplicate.style.display = "";
      }
      hiddenStickyDuplicate = duplicateSticky;
    }
    if (duplicateSticky && duplicateSticky.style.display !== "none") {
      duplicateSticky.style.display = "none";
    }

    // Contain hero wrapper's canvas from inflating scroller height and creating a large empty gap at bottom.
    // The inflated element may be deeply nested (not necessarily steamPanel.firstElementChild), so we
    // search for the sibling of the content container whose scrollHeight is significantly inflated.
    const heroWrapper =
      findInflatedHeroWrapper(container, playBarTop, scroller) ||
      (() => {
        // Fallback: steamPanel.firstElementChild, but only when it doesn't contain the play bar
        const fc = steamPanel.firstElementChild as HTMLElement | null;
        return fc && fc !== playBarTop && !fc.contains(playBarTop) ? fc : null;
      })();
    if (heroWrapper && heroWrapper.style.overflow !== "hidden") {
      if (styledHeroElement !== heroWrapper) {
        if (styledHeroElement && styledHeroElement.isConnected) {
          styledHeroElement.style.overflow = "";
        }
        styledHeroElement = heroWrapper;
      }
      heroWrapper.style.overflow = "hidden";
    }

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
    host.className = "tender-desktop-cards-container";
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

  // Test mode: if customWin is passed, attach directly and return
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

  // Runtime mode: supervisor in window (SharedJSContext)
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

  // Immediate check
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
