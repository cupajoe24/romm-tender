/**
 * Atomic DOM restoration ledger for tracking and reverting DOM mutations.
 *
 * Guarantees that any elements hidden, inline styles mutated, React roots mounted,
 * or event listeners attached by the desktop watcher can be completely and
 * idempotently restored when navigating away from a RomM shortcut.
 */

import type { Root } from "react-dom/client";

interface TrackedListener {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions | undefined;
}

interface TrackedRoot {
  root: Root;
  host: HTMLElement;
}

export class DomRestorationLedger {
  private originalStyles = new Map<HTMLElement, Map<string, string>>();
  private hiddenElements = new Map<HTMLElement, string>();
  private mountedRoots: TrackedRoot[] = [];
  private attachedListeners: TrackedListener[] = [];

  /**
   * Hide an element and record its original display style.
   * If already recorded, updates current display without overwriting initial backup.
   */
  hide(el: HTMLElement | null | undefined): void {
    if (!el) return;
    if (!this.hiddenElements.has(el)) {
      this.hiddenElements.set(el, el.style.display);
    }
    if (el.style.display !== "none") {
      el.style.display = "none";
    }
  }

  /**
   * Unhide an element previously tracked by this ledger, restoring its original display.
   */
  unhide(el: HTMLElement | null | undefined): void {
    if (!el || !this.hiddenElements.has(el)) return;
    const original = this.hiddenElements.get(el);
    this.hiddenElements.delete(el);
    if (el.isConnected) {
      el.style.display = original ?? "";
    }
  }

  /**
   * Check whether an element is currently marked as hidden by this ledger.
   */
  isElementHidden(el: HTMLElement): boolean {
    return this.hiddenElements.has(el);
  }

  /**
   * Set an inline style on an element while recording its original value.
   * Preserves the earliest recorded value so multiple mutations restore accurately.
   */
  style(el: HTMLElement | null | undefined, property: string, value: string): void {
    if (!el) return;
    let propMap = this.originalStyles.get(el);
    if (!propMap) {
      propMap = new Map<string, string>();
      this.originalStyles.set(el, propMap);
    }
    if (!propMap.has(property)) {
      propMap.set(property, el.style.getPropertyValue(property));
    }
    el.style.setProperty(property, value);
  }

  /**
   * Batch record and set multiple styles on an element.
   */
  setStyles(el: HTMLElement | null | undefined, styles: Record<string, string>): void {
    if (!el) return;
    for (const [prop, val] of Object.entries(styles)) {
      this.style(el, prop, val);
    }
  }

  /**
   * Register a mounted React root and its host container element.
   */
  recordRoot(root: Root, host: HTMLElement): void {
    this.mountedRoots.push({ root, host });
  }

  /**
   * Attach an event listener and record it for automatic cleanup.
   */
  addListener(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!target) return;
    target.addEventListener(type, listener, options);
    this.attachedListeners.push({ target, type, listener, options });
  }

  /**
   * Remove and forget a specific listener tracked by this ledger.
   */
  removeListener(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    if (!target) return;
    target.removeEventListener(type, listener);
    this.attachedListeners = this.attachedListeners.filter(
      (l) => !(l.target === target && l.type === type && l.listener === listener),
    );
  }

  /**
   * Revert all mutations, unmount all roots, remove host elements, and detach listeners.
   */
  restoreAll(): void {
    // 1. Detach event listeners
    for (const l of this.attachedListeners) {
      try {
        l.target.removeEventListener(l.type, l.listener, l.options);
      } catch {
        // Ignored
      }
    }
    this.attachedListeners = [];

    // 2. Unmount React roots and remove hosts
    for (const { root, host } of this.mountedRoots) {
      try {
        root.unmount();
      } catch {
        // Ignored
      }
      try {
        if (host.isConnected) {
          host.remove();
        }
      } catch {
        // Ignored
      }
    }
    this.mountedRoots = [];

    // 3. Restore hidden elements
    for (const [el, originalDisplay] of this.hiddenElements) {
      if (el.isConnected) {
        el.style.display = originalDisplay;
      }
    }
    this.hiddenElements.clear();

    // 4. Restore original inline styles
    for (const [el, propMap] of this.originalStyles) {
      if (el.isConnected) {
        for (const [prop, origVal] of propMap) {
          if (origVal) {
            el.style.setProperty(prop, origVal);
          } else {
            el.style.removeProperty(prop);
          }
        }
      }
    }
    this.originalStyles.clear();
  }
}
