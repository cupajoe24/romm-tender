/**
 * The "Tender Settings" item in Steam's "Steam" menu, inserted after Steam's own
 * Settings item in every document that carries one.
 *
 * The item is found by the `steamURL` on its Fiber, never by its localised label
 * or a class, and the inserted item copies its classes from that live item.
 * Where the menu is drawn, and what was measured of it:
 * `docs/architecture/desktop-dom-architecture.md`, "The Tender Settings menu entry".
 */

import { findAncestorFiber, getFiberFromDom } from "../watcher/fiberInspector";
import { DomRestorationLedger } from "../watcher/restorationLedger";

export const SETTINGS_MENU_ENTRY_ATTR = "data-tender-settings-entry";
export const SETTINGS_MENU_ENTRY_LABEL = "Tender Settings";

const STEAM_SETTINGS_URL = "steam://settings";

interface MenuInstance {
  Hide: () => void;
}

interface PopupDescriptor {
  m_popup?: Window;
}

function* popupDocuments(): Generator<Document> {
  const manager = (window as unknown as { g_PopupManager?: { GetPopups?: () => Iterable<PopupDescriptor> } })
    .g_PopupManager;
  if (typeof manager?.GetPopups !== "function") return;
  for (const { m_popup: popup } of manager.GetPopups()) {
    if (!popup || popup.closed) continue;
    try {
      yield popup.document;
    } catch {
      // A popup whose document cannot be read holds no menu we can reach.
    }
  }
}

function isSteamSettingsItem(el: Element): boolean {
  return findAncestorFiber(getFiberFromDom(el), (f) => f.memoizedProps?.steamURL === STEAM_SETTINGS_URL, 6) !== null;
}

function findSteamSettingsItem(doc: Document): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>(".contextMenuItem")) {
    if (isSteamSettingsItem(el)) return el;
  }
  return null;
}

/** The context menu holding `item`, read off a component above it. */
function menuInstanceOf(item: Element): MenuInstance | null {
  const holder = findAncestorFiber(
    getFiberFromDom(item),
    (f) => typeof (f.memoizedProps?.instance as Partial<MenuInstance> | undefined)?.Hide === "function",
    30,
  );
  return (holder?.memoizedProps?.instance as MenuInstance | undefined) ?? null;
}

interface MenuDocument {
  readonly ledger: DomRestorationLedger;
  observer: MutationObserver | null;
  entry: HTMLElement | null;
}

export interface SettingsMenuEntry {
  /** Look for menus the entry is not in yet, and put it back where it is missing. */
  scan(): void;
  /** Take the entry out of every menu and stop watching them. */
  uninstall(): void;
}

/**
 * Install the entry. `onChoose` runs once the menu holding the chosen entry has
 * been hidden.
 *
 * A menu popup is watched for React dropping the entry; any other document — the
 * library window, where a menu Steam does not retain may be drawn — is looked at
 * only when `scan` runs.
 */
export function installSettingsMenuEntry(onChoose: () => void): SettingsMenuEntry {
  const documents = new Map<Document, MenuDocument>();
  let uninstalled = false;

  const createEntry = (doc: Document, item: HTMLElement, menu: MenuDocument): HTMLElement => {
    const entry = doc.createElement("div");
    entry.setAttribute("role", "menuitem");
    entry.setAttribute(SETTINGS_MENU_ENTRY_ATTR, "");
    entry.className = item.className;
    entry.textContent = SETTINGS_MENU_ENTRY_LABEL;
    menu.ledger.addListener(entry, "click", () => {
      menuInstanceOf(findSteamSettingsItem(doc) ?? item)?.Hide();
      onChoose();
    });
    return entry;
  };

  const place = (doc: Document, menu: MenuDocument): void => {
    if (uninstalled) return;
    const item = findSteamSettingsItem(doc);
    const parent = item?.parentElement;
    if (!item || !parent) return;
    if (menu.entry?.isConnected && item.nextElementSibling === menu.entry) return;
    menu.entry ??= createEntry(doc, item, menu);
    menu.ledger.insert(menu.entry, parent, item.nextSibling);
  };

  const watch = (doc: Document, menu: MenuDocument): void => {
    if (!doc.body.classList.contains("ContextMenuPopupBody")) return;
    const Observer = doc.defaultView?.MutationObserver;
    if (!Observer) return;
    menu.observer = new Observer(() => place(doc, menu));
    menu.observer.observe(doc.body, { childList: true, subtree: true });
  };

  const release = (doc: Document, menu: MenuDocument): void => {
    menu.observer?.disconnect();
    menu.ledger.restoreAll();
    documents.delete(doc);
  };

  const scan = (): void => {
    if (uninstalled) return;
    for (const [doc, menu] of documents) {
      if (!doc.defaultView || doc.defaultView.closed) release(doc, menu);
    }
    for (const doc of popupDocuments()) {
      let menu = documents.get(doc);
      if (!menu) {
        if (!findSteamSettingsItem(doc)) continue;
        menu = { ledger: new DomRestorationLedger(), observer: null, entry: null };
        documents.set(doc, menu);
        watch(doc, menu);
      }
      place(doc, menu);
    }
  };

  const uninstall = (): void => {
    uninstalled = true;
    for (const [doc, menu] of documents) release(doc, menu);
  };

  return { scan, uninstall };
}
