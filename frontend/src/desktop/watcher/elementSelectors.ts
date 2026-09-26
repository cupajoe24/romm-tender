/**
 * Multi-tiered durable element selectors for Steam Desktop client DOM.
 *
 * Uses a 4-tier resolution ladder:
 *  - Tier 1: Webpack CSS module exports from @decky/ui
 *  - Tier 2: Read-only React Fiber component names (getFiberDisplayName)
 *  - Tier 3: Semantic ARIA, text content, and SVG geometry heuristics
 *  - Tier 4: Structural DOM hierarchy fallbacks
 *
 * Replaces all brittle minified CSS class hashes with durable semantics.
 */

import {
  appActionButtonClasses,
  appDetailsClasses,
  basicAppDetailsSectionStylerClasses,
  playSectionClasses,
} from "../../utils/deckyUiInternals";
import { getFiberDisplayName } from "./fiberInspector";

export const TENDER_SUBSTITUTE_ID = "tender-desktop-substitute";
export const TENDER_PLAY_BUTTON_ID = "tender-desktop-play-button";

export function getDocument(root: HTMLElement | Document): Document {
  return "ownerDocument" in root && root.ownerDocument ? root.ownerDocument : (root as Document);
}

export function getDirectChild(parent: HTMLElement, descendant: HTMLElement): HTMLElement {
  let curr: HTMLElement = descendant;
  while (curr.parentElement && curr.parentElement !== parent) {
    curr = curr.parentElement;
  }
  return curr;
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
 * Test whether an element represents the Play Bar container.
 * Combines CSS module classes, Fiber component display names, and semantic class substrings.
 */
export function isPlayBarElement(el: HTMLElement): boolean {
  // Tier 1: Webpack CSS module classes
  if (playSectionClasses?.PlayBar && el.classList.contains(playSectionClasses.PlayBar)) return true;
  if (playSectionClasses?.InPage && el.classList.contains(playSectionClasses.InPage)) return true;
  if (playSectionClasses?.Container && el.classList.contains(playSectionClasses.Container)) return true;
  if (appDetailsClasses?.PlayBar && el.classList.contains(appDetailsClasses.PlayBar)) return true;
  if (
    basicAppDetailsSectionStylerClasses?.PlaySection &&
    el.classList.contains(basicAppDetailsSectionStylerClasses.PlaySection)
  ) {
    return true;
  }

  // Tier 2: Fiber component inspection
  const fiberName = getFiberDisplayName(el);
  if (fiberName && /^(PlayBar|PlaySection|InPage|ActionButtonAndStatusPanel)$/i.test(fiberName)) {
    return true;
  }

  // Tier 3: Semantic class substring match (supports underscore or hyphen separated class names)
  if (
    el.className &&
    typeof el.className === "string" &&
    /(?:^|[^a-zA-Z0-9])(PlayBar|PlaySection|InPage)(?:[^a-zA-Z0-9]|$)/i.test(el.className)
  ) {
    return true;
  }

  return false;
}

/**
 * Locate Steam's native overview panel within the document.
 */
export function findSteamOverviewPanel(doc: Document): HTMLElement | null {
  // Tier 1: Resolved CSS module class
  const ovClass = appDetailsClasses?.AppDetailsOverviewPanel;
  if (ovClass) {
    const el = doc.querySelector(`.${ovClass}:not(#${TENDER_SUBSTITUTE_ID})`);
    if (el) return el as HTMLElement;
  }

  // Tier 2: Substring class match
  const bpMatch = doc.querySelector(
    `[class*="AppDetailsOverviewPanel"]:not(#${TENDER_SUBSTITUTE_ID})`,
  ) as HTMLElement | null;
  if (bpMatch) return bpMatch;

  // Tier 3: Fiber inspection on top-level candidates
  const candidates = doc.querySelectorAll<HTMLElement>('div[class*="Panel"], div[class*="Overview"]');
  for (const c of Array.from(candidates)) {
    if (isTenderElement(c)) continue;
    const fiberName = getFiberDisplayName(c);
    if (fiberName && /AppDetailsOverviewPanel|DesktopAppOverview/i.test(fiberName)) {
      return c;
    }
  }

  // Tier 4: Desktop client fallback - Right panel container
  const desktopMatch = doc.querySelector(`[class*="RightPanel"]:not(#${TENDER_SUBSTITUTE_ID})`) as HTMLElement | null;
  if (desktopMatch) {
    const detailChild = desktopMatch.querySelector<HTMLElement>(":scope > div:first-child");
    return detailChild || desktopMatch;
  }

  return null;
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
  return btn;
}

/**
 * Locate Steam's native play button or its container within the play section.
 */
export function findSteamPlayButton(root: HTMLElement | Document): HTMLElement | null {
  // Tier 1: Webpack CSS module classes
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

  // Tier 2: Substring class matches
  const btn = root.querySelector<HTMLElement>(
    '[class*="PlayButtonContainer"], [class*="playbuttoncontainer"], [class*="PlayButton"], [class*="AppActionButton"], button[class*="play" i]',
  );
  if (btn) {
    if (btn.parentElement && /PlayButtonContainer/i.test(btn.parentElement.className)) {
      return btn.parentElement;
    }
    return btn;
  }

  // Tier 3: Semantic ARIA / SVG play triangle / Text content match
  const doc = getDocument(root);
  const searchRoot = "querySelectorAll" in root ? root : doc;
  const candidates = searchRoot.querySelectorAll<HTMLElement>("div, button");
  for (const candidate of Array.from(candidates)) {
    if (isTenderElement(candidate)) continue;

    // Check fiber component name
    const fiberName = getFiberDisplayName(candidate);
    if (fiberName && /PlayButton|AppActionButton/i.test(fiberName)) {
      return candidate.parentElement && /PlayButtonContainer/i.test(candidate.parentElement.className)
        ? candidate.parentElement
        : candidate;
    }

    // Check ARIA label
    const aria = candidate.getAttribute("aria-label");
    if (aria && /\b(play|resume|launch)\b/i.test(aria.trim())) {
      return candidate;
    }

    // Check direct text "PLAY" or "RESUME"
    if (
      candidate.children.length === 0 &&
      (candidate.textContent.trim().toUpperCase() === "PLAY" || candidate.textContent.trim().toUpperCase() === "RESUME")
    ) {
      const focusable = candidate.closest<HTMLElement>('[class*="Focusable"], [class*="Panel"]') ?? candidate;
      return focusable;
    }
  }

  return null;
}

/**
 * Locate Steam's native play section / action bar.
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

    return findActionContainerFromButton(playBtn, root, docBody);
  }

  // Tier 1: Class module matches
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

  // Tier 2: Substring class match
  const directMatch = root.querySelector<HTMLElement>(
    '[class*="PlaySection"], [class*="PlayBar"], [class*="playsection"], [class*="playbar"], [class*="ActionButtonAndStatusPanel"]',
  );
  if (directMatch) return directMatch;

  // Fallback: locate via play button and climb
  const btn = root.querySelector<HTMLElement>(
    '[class*="AppActionButton"], [class*="PlayButton"], button[class*="play" i]',
  );
  if (btn) {
    return findActionContainerFromButton(btn, root, docBody);
  }

  // Structural fallback: first child if root has multiple children
  if ("children" in root && (root as HTMLElement).children.length >= 2) {
    return (root as HTMLElement).firstElementChild as HTMLElement;
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
 * Locate the play bar element and the common content container.
 */
export function findPlayBarAndContainer(
  overviewPanel: HTMLElement,
  playSection: HTMLElement,
): { playBarTop: HTMLElement; container: HTMLElement } {
  if (!overviewPanel.contains(playSection)) {
    return { playBarTop: playSection, container: overviewPanel.parentElement || overviewPanel };
  }

  let curr: HTMLElement | null = playSection;
  let recognizedPlayBar: HTMLElement | null = null;
  while (curr && curr !== overviewPanel && curr !== overviewPanel.parentElement) {
    if (isPlayBarElement(curr)) {
      recognizedPlayBar = curr;
    }
    curr = curr.parentElement;
  }

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
 */
export function findSteamStickyPlayBar(root: Document | HTMLElement, playBarTop: HTMLElement): HTMLElement | null {
  const doc = getDocument(root);
  const isCandidate = (el: HTMLElement | null): el is HTMLElement => {
    if (!el) return false;
    if (el === playBarTop || playBarTop.contains(el) || el.contains(playBarTop)) return false;
    if (isTenderElement(el)) return false;
    return true;
  };

  const appDetailsPb = appDetailsClasses?.PlayBar;
  if (appDetailsPb) {
    const matches = doc.querySelectorAll<HTMLElement>(`.${appDetailsPb}`);
    for (const el of Array.from(matches)) {
      if (isCandidate(el)) return el;
    }
  }

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

  const showPlayBarClass = appDetailsClasses?.ShowPlayBar;
  if (showPlayBarClass) {
    const matches = doc.querySelectorAll<HTMLElement>(`.${showPlayBarClass}`);
    for (const el of Array.from(matches)) {
      if (isCandidate(el)) return el;
    }
  }

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
 * Locate content sections to hide (non-Steam placeholder, notes, screenshots).
 */
export function findSteamContentSections(overviewPanel: HTMLElement, playSection: HTMLElement | null): HTMLElement[] {
  if (!playSection) {
    return [];
  }

  const { playBarTop } = findPlayBarAndContainer(overviewPanel, playSection);
  const toHide = new Set<HTMLElement>();

  let next = playBarTop.nextElementSibling as HTMLElement | null;
  while (next) {
    if (next.id !== TENDER_SUBSTITUTE_ID && !isTenderElement(next)) {
      toHide.add(next);
    }
    next = next.nextElementSibling as HTMLElement | null;
  }

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

  if (toHide.size === 0 && !overviewPanel.contains(playSection)) {
    toHide.add(overviewPanel);
  }

  return Array.from(toHide);
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

  const fiberName = getFiberDisplayName(el);
  if (
    fiberName &&
    /^(RightControls|AppButtons|AppButtonsContainer|ControllerConfig|FavoriteButton)$/i.test(fiberName)
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
 * Locate Steam's native play bar badges (Last Played, Playtime, Cloud Status, etc.) to hide.
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

  // 1. Primary badge / stats container
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

  // 2. Individual stat / badge items
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

  // 3. PlayBarDetailLabel / PlayBarLabel
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

  // 4. Text-matching fallback for unhashed badge labels
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
 * Locate Steam's right-side control buttons container (Settings gear, Controller layout, Favorite).
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
