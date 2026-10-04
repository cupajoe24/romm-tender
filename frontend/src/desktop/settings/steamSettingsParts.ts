/**
 * The parts of Steam's own settings window that Tender Settings is built from.
 *
 * Each is found by the source text of the function it is, or of a function its
 * module exports beside it, never by a module number or a minified name. What
 * each part was read to be, and what it takes:
 * `docs/architecture/desktop-dom-architecture.md`, "The Tender Settings Window".
 */

import { SidebarNavigation, findModuleByExport, findModuleExport, type SidebarNavigationProps } from "@decky/ui";
import type { ComponentType, ReactNode } from "react";

/** The props of Steam's popup component that Tender passes. */
export interface SteamPopupProps {
  strTitle: string;
  popupWidth: number;
  popupHeight: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  modal?: boolean;
  saveDimensionsKey?: string;
  onDismiss?: () => void;
  refPopup?: (popup: Window | undefined) => void;
  children: ReactNode;
}

/** Steam's wrapper around react-router's `MemoryRouter`. */
export interface SteamMemoryRouterProps {
  initialRoute: string;
  children: ReactNode;
}

/**
 * `SidebarNavigation` with the prop `@decky/ui`'s types leave out: Steam hands
 * the callback a function that moves the open sidebar to a page.
 */
export type SteamSidebarProps = SidebarNavigationProps & {
  fnSetNavigateToPage?: (navigate: (page: string) => void) => void;
};

/** What Steam's `ActiveAccountProvider` carries: a hook answering the signed-in account's 64-bit SteamID. */
export interface ActiveAccount {
  useActiveAccount: () => string;
}

export interface ActiveAccountProviderProps {
  value: ActiveAccount;
  children: ReactNode;
}

export interface SteamSettingsParts {
  /** The popup throws without it above: its saved-size hook asks it for the account. */
  readonly AccountProvider: ComponentType<ActiveAccountProviderProps>;
  readonly account: ActiveAccount;
  readonly Popup: ComponentType<SteamPopupProps>;
  readonly Router: ComponentType<SteamMemoryRouterProps>;
  readonly Sidebar: ComponentType<SteamSidebarProps>;
}

const sourceOf = (candidate: unknown): string =>
  typeof candidate === "function" ? Function.prototype.toString.call(candidate) : "";

/** The popup component: it chooses between drawing inline and popping out. */
export function isSteamPopupComponent(candidate: unknown): boolean {
  const source = sourceOf(candidate);
  return source.includes("onlyPopoutIfNeeded") && source.includes('"popout"') && source.includes('"inline"');
}

/**
 * Steam's router wrapper. Another module names all three props too, but in
 * separate functions; only the wrapper starts its history at the last entry.
 */
export function isSteamMemoryRouter(candidate: unknown): boolean {
  const source = sourceOf(candidate);
  return source.includes("initialRoute") && /initialIndex:[\w$]+\.length-1/.test(source);
}

/** The account hook, which throws outside its provider; the provider is exported beside it. */
export function isActiveAccountHook(candidate: unknown): boolean {
  return sourceOf(candidate).includes("called useActiveAccount outside of ActiveAccountProvider");
}

const REACT_CONTEXT = Symbol.for("react.context");

/** A React 19 context, which is its own provider. */
function contextExportOf(module: unknown): ComponentType<ActiveAccountProviderProps> | undefined {
  if (typeof module !== "object" || module === null) return undefined;
  const found = Object.values(module).find(
    (value: unknown) =>
      typeof value === "object" && value !== null && "$$typeof" in value && value.$$typeof === REACT_CONTEXT,
  );
  return found as ComponentType<ActiveAccountProviderProps> | undefined;
}

interface SteamConnection {
  steamid?: { ConvertTo64BitString?: () => string };
}

/**
 * The value Steam's own roots provide, read off the same global they read it
 * from: Steam's connection manager, `window.cm`.
 */
function steamActiveAccount(): ActiveAccount | undefined {
  const steamid = (window as unknown as { cm?: SteamConnection }).cm?.steamid;
  const convert = steamid?.ConvertTo64BitString;
  if (!steamid || typeof convert !== "function") return undefined;
  return { useActiveAccount: () => convert.call(steamid) };
}

let accountProvider: ComponentType<ActiveAccountProviderProps> | undefined;
let popup: ComponentType<SteamPopupProps> | undefined;
let router: ComponentType<SteamMemoryRouterProps> | undefined;

/**
 * Every part, or the names of the ones a search did not find.
 *
 * A search that found its part is not asked again: Steam's registry does not
 * change within a JS context. One that missed is asked again next time.
 */
export function findSteamSettingsParts(): { parts: SteamSettingsParts } | { missing: readonly string[] } {
  accountProvider ??= contextExportOf(findModuleByExport(isActiveAccountHook));
  popup ??= findModuleExport(isSteamPopupComponent) as ComponentType<SteamPopupProps> | undefined;
  router ??= findModuleExport(isSteamMemoryRouter) as ComponentType<SteamMemoryRouterProps> | undefined;
  const sidebar = SidebarNavigation as ComponentType<SteamSidebarProps> | undefined;
  const account = steamActiveAccount();
  if (accountProvider && account && popup && router && sidebar) {
    return { parts: { AccountProvider: accountProvider, account, Popup: popup, Router: router, Sidebar: sidebar } };
  }
  const missing: string[] = [];
  if (!accountProvider) missing.push("account provider");
  if (!account) missing.push("signed-in account");
  if (!popup) missing.push("popup");
  if (!router) missing.push("router");
  if (!sidebar) missing.push("SidebarNavigation");
  return { missing };
}

/** Forget what the searches found. For tests. */
export function resetSteamSettingsParts(): void {
  accountProvider = undefined;
  popup = undefined;
  router = undefined;
}
