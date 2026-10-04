/**
 * Opening and closing the Tender Settings window, and keeping its menu entry in
 * Steam's "Steam" menu.
 *
 * The window is drawn by a React root of its own, created in SharedJSContext
 * rather than in the library window's document; Steam's popup component portals
 * its content into the window it creates. When it closes, why it reopens, and
 * the realm rules for anything bound to it:
 * `docs/architecture/desktop-dom-architecture.md`, "The Tender Settings Window".
 */

import { debugLog } from "../../api/backend";
import type { SettingsTab } from "../../types/navigation";
import { detach } from "../../utils/detach";
import { findDesktopWindow, findReactClient } from "../desktopWindow";
import { DomRestorationLedger } from "../watcher/restorationLedger";
import { installSettingsMenuEntry } from "./settingsMenuEntry";
import { findSteamSettingsParts } from "./steamSettingsParts";
import { DEFAULT_SETTINGS_TAB } from "./tabs";
import { TenderSettingsWindow } from "./TenderSettingsWindow";

interface SteamPopupWindow {
  SteamClient?: { Window?: { BringToFront?: () => void } };
}

interface ShownWindow {
  readonly ledger: DomRestorationLedger;
  tab: SettingsTab;
  popup: Window | undefined;
  navigate: ((tab: SettingsTab) => void) | null;
}

let shown: ShownWindow | null = null;
/** The tab a window closed by Tender rather than by its reader reopens on. */
let reopenTab: SettingsTab | null = null;
let stopSupervisor: (() => void) | null = null;

const SUPERVISOR_INTERVAL_MS = 500;

const note = (line: string): void => detach(debugLog(`Tender Settings: ${line}`));

function bringToFront(popup: Window | undefined): void {
  try {
    (popup as SteamPopupWindow | undefined)?.SteamClient?.Window?.BringToFront?.();
  } catch {
    // A window gone between the check and the call has nothing to bring forward.
  }
}

function closeShown(): void {
  const closing = shown;
  shown = null;
  closing?.ledger.restoreAll();
}

/** The reader closed the window. Deferred: it arrives from inside the root being unmounted. */
function dismiss(opened: ShownWindow): void {
  queueMicrotask(() => {
    if (shown !== opened) return;
    reopenTab = null;
    closeShown();
  });
}

function attachPopup(opened: ShownWindow, popup: Window | undefined): void {
  if (shown !== opened || opened.popup === popup) return;
  opened.popup = popup;
  if (!popup) return;
  // Registered when the window is created, so it runs before any listener a tab
  // adds; whether something inside claimed the key (a dialog's Escape) is only
  // known once the whole dispatch is over, so the answer waits for it.
  opened.ledger.addListener(popup, "keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    setTimeout(() => {
      if (!event.defaultPrevented) dismiss(opened);
    }, 0);
  });
}

function show(tab: SettingsTab): boolean {
  const found = findSteamSettingsParts();
  const client = findReactClient();
  if (!("parts" in found) || !client) {
    const missing = "missing" in found ? [...found.missing] : [];
    if (!client) missing.push("createRoot");
    note(`cannot open, Steam's ${missing.join(", ")} not found`);
    return false;
  }

  const ledger = new DomRestorationLedger();
  const opened: ShownWindow = { ledger, tab, popup: undefined, navigate: null };
  const host = document.createElement("div");
  try {
    const root = client.createRoot(host);
    ledger.recordRoot(root, host);
    shown = opened;
    root.render(
      <TenderSettingsWindow
        parts={found.parts}
        initialTab={tab}
        onDismiss={() => dismiss(opened)}
        onPopup={(popup) => attachPopup(opened, popup)}
        onNavigator={(navigate) => {
          opened.navigate = navigate;
        }}
        onTabShown={(next) => {
          opened.tab = next;
        }}
      />,
    );
    return true;
  } catch (e) {
    note(`could not draw the window: ${e}`);
    if (shown === opened) shown = null;
    ledger.restoreAll();
    return false;
  }
}

/**
 * Open the window on `tab`, or bring the open one to the front and move it to
 * `tab`. Answers whether a window is open afterwards.
 */
export function openTenderSettings(tab?: SettingsTab): boolean {
  if (shown) {
    bringToFront(shown.popup);
    if (tab && tab !== shown.tab) shown.navigate?.(tab);
    return true;
  }
  return show(tab ?? DEFAULT_SETTINGS_TAB);
}

/** Is the window open, and on which tab. For tests and diagnostics. */
export function shownSettingsTab(): SettingsTab | null {
  return shown?.tab ?? null;
}

const liveDesktopWindow = (): Window | undefined => {
  const win = findDesktopWindow();
  return win && !win.closed ? win : undefined;
};

/**
 * Put the entry in Steam's menu and watch the library window: the Tender
 * Settings window closes with it, and opens again on its tab once a new one is
 * there. A window open when the surface was last stopped opens again here.
 */
export function startTenderSettings(): void {
  stopTenderSettings();
  let stopped = false;
  let desktop = liveDesktopWindow();
  const menuEntry = installSettingsMenuEntry(() => {
    openTenderSettings();
  });

  const tick = (): void => {
    if (stopped) return;
    const now = liveDesktopWindow();
    if (now !== desktop) {
      desktop = now;
      if (shown) {
        reopenTab = shown.tab;
        closeShown();
      }
    }
    if (desktop && reopenTab && !shown) {
      const tab = reopenTab;
      reopenTab = null;
      show(tab);
    }
    menuEntry.scan();
  };

  // Nothing unregisters these, so they outlive this start; once it has stopped
  // they must do nothing.
  const manager = (
    window as unknown as {
      g_PopupManager?: {
        AddPopupCreatedCallback?: (cb: () => void) => void;
        AddPopupDestroyedCallback?: (cb: () => void) => void;
      };
    }
  ).g_PopupManager;
  try {
    manager?.AddPopupCreatedCallback?.(tick);
    manager?.AddPopupDestroyedCallback?.(tick);
  } catch {
    // The interval below still finds every change, a little later.
  }
  const interval = window.setInterval(tick, SUPERVISOR_INTERVAL_MS);
  tick();

  stopSupervisor = () => {
    stopped = true;
    window.clearInterval(interval);
    menuEntry.uninstall();
  };
}

/** Take the menu entry away and close the window, remembering its tab for the next start. */
export function stopTenderSettings(): void {
  stopSupervisor?.();
  stopSupervisor = null;
  if (shown) {
    reopenTab = shown.tab;
    closeShown();
  }
}

/** Forget a window remembered for reopening. For tests. */
export function forgetTenderSettings(): void {
  reopenTab = null;
}
