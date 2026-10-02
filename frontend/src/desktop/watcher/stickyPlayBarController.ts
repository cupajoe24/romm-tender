/**
 * Sticky play bar scroll controller and hero wrapper layout containment.
 *
 * Handles:
 *  - Discovering the scroll container for the game overview
 *  - Monitoring scroll position to toggle between semi-transparent glass
 *    and solid background with drop shadow when pinned
 *  - Keeping the hero wrapper at `overflow: visible`, which the banner's 3D parallax needs, and
 *    bounding the artwork's overflow so it does not scroll the page past its content
 *    (docs/architecture/desktop-dom-architecture.md, "Hero Banner Parallax")
 */

import {
  GLASS_PLAY_BAR_BG,
  GLASS_PLAY_BAR_GRADIENT,
  PINNED_PLAY_BAR_SHADOW,
  SOLID_PLAY_BAR_BG,
} from "../gameview/styles";
import {
  findHeroMirrorCanvas,
  findHeroParallaxLayer,
  findHeroWrapperFallback,
  isTenderElement,
} from "./elementSelectors";
import type { DomRestorationLedger } from "./restorationLedger";

/** How far, in the parallax layer's own pixels, the artwork fades out before the clip edge. */
const HERO_FADE_PX = 160;

/** The vertical scale (m22) of a `matrix3d(...)` or `matrix(...)` transform, or null for anything else. */
function verticalScale(transform: string): number | null {
  const match = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
  if (!match) return null;
  const values = match[2]!.split(",").map(Number);
  const m22 = match[1] ? values[5] : values[3];
  return m22 !== undefined && Number.isFinite(m22) && m22 !== 0 ? m22 : null;
}

function setIfChanged(ledger: DomRestorationLedger, el: HTMLElement, property: string, value: string): void {
  if (el.style.getPropertyValue(property) !== value) ledger.style(el, property, value);
}

/**
 * Keep the hero artwork from extending the page past its content.
 *
 * The parallax layer's content (the image, then the mirrored canvas below it)
 * is far taller than the layer, and Chromium counts that overflow towards the
 * scroller's height at the layer's own scale, so the page scrolls on past the
 * last card. The layer is clipped (`overflow: clip`), with an
 * `overflow-clip-margin` that lets the artwork run on exactly as far as the
 * content does: its scrollable bottom is `layerTop + scale × (height + margin)`.
 * The clip goes on the layer because it is the end of the 3D chain and already
 * `transform-style: flat`; clipping the hero wrapper or any ancestor would
 * flatten the parallax. The mirrored canvas then fades out over its last
 * {@link HERO_FADE_PX} pixels before the clip edge rather than stopping on a line.
 */
export function boundHeroOverflow(
  heroWrapper: HTMLElement,
  scroller: HTMLElement,
  content: HTMLElement,
  ledger: DomRestorationLedger,
): void {
  const layer = findHeroParallaxLayer(heroWrapper);
  const win = layer?.ownerDocument.defaultView;
  if (!layer || !win) return;
  const scale = verticalScale(win.getComputedStyle(layer).transform);
  if (scale === null || scale < 0) return;

  const scrollerTop = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const offsetParent = layer.offsetParent as HTMLElement | null;
  let layerTop: number;
  if (offsetParent === scroller) layerTop = layer.offsetTop;
  else if (offsetParent && scroller.contains(offsetParent))
    layerTop = offsetParent.getBoundingClientRect().top - scrollerTop + layer.offsetTop;
  else return;

  const contentBottom = content.getBoundingClientRect().bottom - scrollerTop;
  const target = Math.max(contentBottom, scroller.clientHeight);
  const margin = Math.max(0, Math.floor((target - layerTop) / scale - layer.offsetHeight));
  setIfChanged(ledger, layer, "overflow", "clip");
  setIfChanged(ledger, layer, "overflow-clip-margin", `${margin}px`);

  const mirror = findHeroMirrorCanvas(layer);
  if (!mirror || mirror.offsetParent !== layer) return;
  const visible = layer.offsetHeight + margin - mirror.offsetTop;
  if (visible <= 0) return;
  // The canvas is flipped, so its visual top is its own bottom edge.
  const flipped = (verticalScale(win.getComputedStyle(mirror).transform) ?? 1) < 0;
  const direction = flipped ? "to top" : "to bottom";
  const fadeFrom = Math.max(0, visible - HERO_FADE_PX);
  setIfChanged(
    ledger,
    mirror,
    "mask-image",
    `linear-gradient(${direction}, black ${fadeFrom}px, transparent ${visible}px)`,
  );
}

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

  const ensureHeroVisible = (heroWrapper = getHeroWrapper()) => {
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
    const heroWrapper = getHeroWrapper();
    ensureHeroVisible(heroWrapper);
    if (heroWrapper && container && scroller !== win) {
      boundHeroOverflow(heroWrapper, scroller as HTMLElement, container, ledger);
    }
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
