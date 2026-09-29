/**
 * Sticky play bar scroll controller and hero wrapper layout containment.
 *
 * Handles:
 *  - Discovering the scroll container for the game overview
 *  - Monitoring scroll position to toggle between semi-transparent glass
 *    and solid background with drop shadow when pinned
 *  - Keeping the hero wrapper at `overflow: visible`, which the banner's 3D parallax needs
 *    (docs/architecture/desktop-dom-architecture.md, "Hero Banner Parallax")
 */

import {
  GLASS_PLAY_BAR_BG,
  GLASS_PLAY_BAR_GRADIENT,
  PINNED_PLAY_BAR_SHADOW,
  SOLID_PLAY_BAR_BG,
} from "../gameview/styles";
import { findHeroWrapperFallback, isTenderElement } from "./elementSelectors";
import type { DomRestorationLedger } from "./restorationLedger";

/**
 * Locate the scrollable container for an element (e.g. Steam's game overview scroller).
 * Returns the scrollable element if found, or the default window.
 */
export function findScrollContainer(el: HTMLElement): HTMLElement | Window {
  const win = el.ownerDocument.defaultView || window;
  let curr = el.parentElement;
  while (curr && curr !== el.ownerDocument.body && curr !== el.ownerDocument.documentElement) {
    const style = win.getComputedStyle(curr);
    const overflowY = style.overflowY || style.overflow;
    if (overflowY === "auto" || overflowY === "scroll") {
      return curr;
    }
    curr = curr.parentElement;
  }
  return win;
}

/**
 * Determine if the play bar has reached the top of its scroll container and is currently pinned.
 */
export function isPlayBarPinned(playBarTop: HTMLElement, scroller: HTMLElement | Window): boolean {
  const rect = playBarTop.getBoundingClientRect();
  if ("getBoundingClientRect" in scroller && typeof scroller.getBoundingClientRect === "function") {
    const scrollerRect = (scroller as HTMLElement).getBoundingClientRect();
    return rect.top <= scrollerRect.top + 2;
  }
  return rect.top <= 2;
}

/**
 * Locate any hero background wrapper whose canvas/content inflates scrollHeight.
 * Walks up from the container looking for siblings whose scrollHeight exceeds offsetHeight by 200px.
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
      if (
        sibling.scrollHeight > sibling.offsetHeight + 200 ||
        (sibling.querySelector("canvas") !== null && sibling.scrollHeight > sibling.offsetHeight)
      ) {
        return sibling;
      }
    }

    if (parent === scrollerEl) break;
    curr = parent;
  }

  return null;
}

export interface StickyPlayBarController {
  matches(playBarTop: HTMLElement, playSection: HTMLElement): boolean;
  updatePinning(): void;
  dispose(): void;
}

/**
 * Setup sticky play bar behavior and scroll monitoring using the provided ledger.
 */
export function createStickyPlayBarController(
  playBarTop: HTMLElement,
  playSection: HTMLElement,
  ledger: DomRestorationLedger,
  container?: HTMLElement,
  steamPanel?: HTMLElement,
): StickyPlayBarController {
  const applyBaselineStyles = () => {
    ledger.style(playBarTop, "position", "sticky");
    ledger.style(playBarTop, "top", "0px");
    ledger.style(playBarTop, "z-index", "10");
    ledger.style(playBarTop, "opacity", "1");
    ledger.style(playBarTop, "pointer-events", "auto");
    ledger.style(playBarTop, "padding-bottom", "2px");
    if (!playBarTop.style.transition) {
      ledger.style(playBarTop, "transition", "background-color 0.2s ease, box-shadow 0.2s ease");
    }

    if (playSection !== playBarTop) {
      if (!playSection.style.transition) {
        ledger.style(playSection, "transition", "background-color 0.2s ease");
      }
    }
  };

  applyBaselineStyles();

  const scroller = findScrollContainer(playBarTop);
  const win = playBarTop.ownerDocument.defaultView || window;

  const getHeroWrapper = (): HTMLElement | null => {
    if (!container || !steamPanel) return null;
    return findInflatedHeroWrapper(container, playBarTop, scroller) || findHeroWrapperFallback(steamPanel, playBarTop);
  };

  const ensureHeroVisible = () => {
    const heroWrapper = getHeroWrapper();
    if (!heroWrapper) return;
    if (heroWrapper.style.overflow !== "visible") {
      ledger.style(heroWrapper, "overflow", "visible");
    }
  };

  let isPinnedState: boolean | null = null;

  function applyPlayBarState(pinned: boolean) {
    ensureHeroVisible();
    if (isPinnedState === pinned) return;
    isPinnedState = pinned;

    if (pinned) {
      ledger.style(playBarTop, "background-image", "none");
      ledger.style(playBarTop, "background-color", SOLID_PLAY_BAR_BG);
      ledger.style(playBarTop, "backdrop-filter", "none");
      ledger.style(playBarTop, "-webkit-backdrop-filter", "none");
      ledger.style(playBarTop, "box-shadow", PINNED_PLAY_BAR_SHADOW);
      if (playSection !== playBarTop) {
        ledger.style(playSection, "background-color", SOLID_PLAY_BAR_BG);
      }
    } else {
      ledger.style(playBarTop, "background-image", GLASS_PLAY_BAR_GRADIENT);
      ledger.style(playBarTop, "background-color", GLASS_PLAY_BAR_BG);
      ledger.style(playBarTop, "backdrop-filter", "blur(12px)");
      ledger.style(playBarTop, "-webkit-backdrop-filter", "blur(12px)");
      ledger.style(playBarTop, "box-shadow", "none");
      if (playSection !== playBarTop) {
        ledger.style(playSection, "background-color", "transparent");
      }
    }
  }

  const updatePinning = () => {
    if (!playBarTop.isConnected) return;
    applyBaselineStyles();
    ensureHeroVisible();
    const pinned = isPlayBarPinned(playBarTop, scroller);
    applyPlayBarState(pinned);
  };

  const WinResizeObserver = (win as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver || ResizeObserver;
  let ro: ResizeObserver | null = null;
  if (typeof WinResizeObserver === "function") {
    try {
      ro = new WinResizeObserver(() => {
        updatePinning();
      });
      ro.observe(playBarTop);
      if ("nodeType" in scroller && (scroller as HTMLElement).nodeType === 1) {
        ro.observe(scroller as HTMLElement);
      }
    } catch {
      // Ignored in headless/test environments
    }
  }

  ledger.addListener(scroller, "scroll", updatePinning, { passive: true });
  ledger.addListener(win, "resize", updatePinning, { passive: true });
  updatePinning();

  // Async hero banner canvas rendering often completes 50-350ms after initial mount
  if (typeof win.setTimeout === "function") {
    win.setTimeout(updatePinning, 50);
    win.setTimeout(updatePinning, 150);
    win.setTimeout(updatePinning, 350);
  }

  return {
    matches: (top: HTMLElement, sec: HTMLElement) =>
      top === playBarTop && sec === playSection && playBarTop.isConnected,
    updatePinning,
    dispose: () => {
      if (ro) {
        ro.disconnect();
        ro = null;
      }
      ledger.removeListener(scroller, "scroll", updatePinning);
      ledger.removeListener(win, "resize", updatePinning);
      if (playSection !== playBarTop && playSection.isConnected) {
        ledger.style(playSection, "background-color", "transparent");
      }
    },
  };
}
