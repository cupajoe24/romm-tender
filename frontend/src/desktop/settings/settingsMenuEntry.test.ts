import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SETTINGS_MENU_ENTRY_ATTR,
  SETTINGS_MENU_ENTRY_LABEL,
  installSettingsMenuEntry,
  type SettingsMenuEntry,
} from "./settingsMenuEntry";

// happy-dom has one realm, so the test's own document stands in for the
// "Steam Root Menu" popup's. The Fiber chain is shaped after the one read on
// the device: the item's div, two components, the one carrying the menu entry's
// props, and further up the host holding the menu's instance.
const FIBER_KEY = "__reactFiber$test";

function withFiber(el: HTMLElement, props: Record<string, unknown>, instance: { Hide: () => void }): HTMLElement {
  const host = { memoizedProps: { instance }, return: null };
  const entry = { memoizedProps: props, return: { memoizedProps: { menuItems: [] }, return: host } };
  (el as unknown as Record<string, unknown>)[FIBER_KEY] = {
    memoizedProps: { role: "menuitem" },
    return: { memoizedProps: {}, return: entry },
  };
  return el;
}

interface Menu {
  readonly list: HTMLElement;
  readonly settings: HTMLElement;
  readonly exit: HTMLElement;
  readonly hide: ReturnType<typeof vi.fn>;
}

function drawMenu(): Menu {
  const hide = vi.fn();
  const instance = { Hide: hide };
  const list = document.createElement("div");
  const item = (label: string, props: Record<string, unknown>): HTMLElement => {
    const el = document.createElement("div");
    el.className = "hashed-a hashed-b contextMenuItem";
    el.textContent = label;
    return withFiber(el, props, instance);
  };
  const separator = (): HTMLElement => {
    const el = document.createElement("div");
    el.className = "hashed-a separator";
    return el;
  };
  const settings = item("Settings", { name: "#Menu_Settings", steamURL: "steam://settings" });
  const exit = item("Exit", { name: "#Menu_Exit", steamURL: "steam://exit" });
  list.append(item("Go Offline...", { name: "#Menu_GoOffline" }), separator(), settings, separator(), exit);
  document.body.appendChild(list);
  return { list, settings, exit, hide };
}

const entries = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`[${SETTINGS_MENU_ENTRY_ATTR}]`)];

const flushObservers = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let popups: { m_popup?: Window }[];
let installed: SettingsMenuEntry | null;

beforeEach(() => {
  popups = [{ m_popup: window }];
  vi.stubGlobal("g_PopupManager", { GetPopups: () => popups });
  document.body.className = "ContextMenuPopupBody DesktopUI";
  installed = null;
});

afterEach(() => {
  installed?.uninstall();
  document.body.replaceChildren();
  document.body.className = "";
  vi.unstubAllGlobals();
});

const install = (onChoose: () => void = vi.fn()): SettingsMenuEntry => {
  installed = installSettingsMenuEntry(onChoose);
  return installed;
};

describe("the Tender Settings menu entry", () => {
  it("is inserted right after Steam's Settings item, looking like it", () => {
    const menu = drawMenu();
    install().scan();

    const [entry] = entries();
    expect(entries()).toHaveLength(1);
    expect(menu.settings.nextElementSibling).toBe(entry);
    expect(entry?.textContent).toBe(SETTINGS_MENU_ENTRY_LABEL);
    expect(entry?.getAttribute("role")).toBe("menuitem");
    expect(entry?.className).toBe(menu.settings.className);
  });

  it("finds Steam's item by its steam://settings URL, not by its label", () => {
    const menu = drawMenu();
    menu.settings.textContent = "Einstellungen";
    menu.exit.textContent = "Settings";
    install().scan();

    expect(menu.settings.nextElementSibling).toBe(entries()[0]);
  });

  it("is not inserted into a document without Steam's Settings item", () => {
    const menu = drawMenu();
    menu.settings.remove();
    install().scan();

    expect(entries()).toHaveLength(0);
  });

  it("is inserted once however often the menus are looked at", () => {
    drawMenu();
    const entry = install();
    entry.scan();
    entry.scan();

    expect(entries()).toHaveLength(1);
  });

  it("hides Steam's menu and then opens the window when chosen", () => {
    const menu = drawMenu();
    const order: string[] = [];
    menu.hide.mockImplementation(() => order.push("hide"));
    install(() => order.push("open")).scan();

    entries()[0]?.click();

    expect(order).toEqual(["hide", "open"]);
  });

  it("still opens the window when the menu's instance cannot be found", () => {
    const menu = drawMenu();
    const onChoose = vi.fn();
    install(onChoose).scan();
    (menu.settings as unknown as Record<string, unknown>)[FIBER_KEY] = {
      memoizedProps: {},
      return: { memoizedProps: { steamURL: "steam://settings" }, return: null },
    };

    entries()[0]?.click();

    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("is put back in a menu popup when something takes it out", async () => {
    const menu = drawMenu();
    install().scan();
    entries()[0]?.remove();

    await flushObservers();

    expect(entries()).toHaveLength(1);
    expect(menu.settings.nextElementSibling).toBe(entries()[0]);
  });

  it("is put back in any other document only when the menus are looked at again", async () => {
    document.body.className = "DesktopUI";
    drawMenu();
    const entry = install();
    entry.scan();
    entries()[0]?.remove();

    await flushObservers();
    expect(entries()).toHaveLength(0);

    entry.scan();
    expect(entries()).toHaveLength(1);
  });

  it("is taken out of every menu, and stays out, once uninstalled", async () => {
    const menu = drawMenu();
    const entry = install();
    entry.scan();

    entry.uninstall();
    expect(entries()).toHaveLength(0);
    expect(menu.settings.nextElementSibling).not.toBeNull();

    entry.scan();
    menu.list.appendChild(document.createElement("div"));
    await flushObservers();
    expect(entries()).toHaveLength(0);
  });

  it("lets go of a menu whose window has closed", () => {
    drawMenu();
    const entry = install();
    entry.scan();
    const [inserted] = entries();

    popups = [];
    vi.spyOn(window, "closed", "get").mockReturnValue(true);
    entry.scan();

    expect(inserted?.isConnected).toBe(false);
  });

  it("looks at nothing where Steam's popup manager is not there", () => {
    vi.stubGlobal("g_PopupManager", undefined);
    drawMenu();
    install().scan();

    expect(entries()).toHaveLength(0);
  });
});
