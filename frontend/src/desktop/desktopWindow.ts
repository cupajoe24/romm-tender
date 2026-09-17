/**
 * Locates the Steam Desktop client window and client runtime modules.
 *
 * In Steam's architecture, plugin code evaluates in the SharedJSContext window,
 * whereas the desktop client UI renders in its own popup window (`SP Desktop *`).
 * All DOM operations, elements, and constructors (such as MutationObserver) must
 * be sourced from that window's realm, never from SharedJSContext.
 */

import { findModule } from "@decky/ui";
import type { Root } from "react-dom/client";

export interface ReactClientModule {
  createRoot: (container: Element | DocumentFragment) => Root;
}

interface PopupDescriptor {
  m_strName?: string;
  m_popup?: Window;
}

interface PopupManager {
  GetPopups: () => Iterable<PopupDescriptor>;
}

interface SteamAppStore {
  GetAppOverviewByAppID?: (appId: number) => unknown;
  GetCustomVerticalCapsuleURLs?: (overview: unknown) => string[] | undefined;
}

/** Locates the desktop client window (`SP Desktop`) from Steam's popup manager. */
export function findDesktopWindow(): Window | undefined {
  const popupManager = (window as unknown as { g_PopupManager?: PopupManager }).g_PopupManager;
  if (!popupManager || typeof popupManager.GetPopups !== "function") {
    return undefined;
  }

  const popups = popupManager.GetPopups();
  for (const p of popups) {
    if (typeof p.m_strName === "string" && p.m_strName.startsWith("SP Desktop")) {
      return p.m_popup;
    }
  }
  return undefined;
}

/**
 * Resolves React 19's `createRoot` via module probe.
 *
 * In React 19, `createRoot` is housed in its own client module rather than
 * on `SP_REACTDOM`. We locate the module export carrying `createRoot`.
 */
export function findReactClient(): ReactClientModule | undefined {
  return findModule((m: unknown) => {
    return typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).createRoot === "function";
  }) as ReactClientModule | undefined;
}

/**
 * Cover candidate URLs for a shortcut appId.
 *
 * Steam's `GetCustomVerticalCapsuleURLs` returns a candidate list (e.g. .jpg
 * then .png). The consumer falls through candidates on load failure.
 */
export function coverCandidates(appId: number): string[] {
  const store = (window as unknown as { appStore?: SteamAppStore }).appStore;
  if (!store || typeof store.GetAppOverviewByAppID !== "function") {
    return [];
  }

  const ov = store.GetAppOverviewByAppID(appId);
  if (!ov || typeof store.GetCustomVerticalCapsuleURLs !== "function") {
    return [];
  }

  const urls = store.GetCustomVerticalCapsuleURLs(ov);
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls.map((u) => `https://steamloopback.host${u}`);
}
