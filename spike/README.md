# Spike #1897 — Tender's own Quick Access entry, without Decky

Throwaway. Nothing here ships, and this branch is not meant to be merged. It exists so the measurements behind #1899,
#1900 and #1901 can be reproduced.

## Running it

```
python3 spike/serve.py --port 27737          # serves dist/ plus the repo's assets/
node_modules/.bin/rollup -c spike/rollup.config.mjs
```

Then, in Steam's `SharedJSContext` via the CEF debugger on `localhost:8080`:

```js
// 1. only when Decky is NOT running — Decky installs these itself
await (await import("http://127.0.0.1:27737/globals.js")).installGlobals();

// 2. one of the two, see below
await import("http://127.0.0.1:27737/index.js?adopt=1"); // Decky absent
await import("http://127.0.0.1:27737/index-dfl.js?adopt=1"); // Decky running
```

`window.__TENDER_SPIKE` then carries `positions()`, `probe`, `renders`, `tabCount()`, `unpatch()` and
`debugMoveToFront()`.

## The three builds, and why there are three

- **`globals.js`** installs `SP_REACT` / `SP_JSX` / `SP_REACTDOM`. Steam does not define them; Decky's loader does. It
  has to be a separate module from the one importing `@decky/ui`, because `@decky/ui` reads React internals at import
  time and dies outright if they are not set yet.
- **`index.js`** bundles `@decky/ui`. Use only when Decky is absent.
- **`index-dfl.js`** takes `@decky/ui` from Decky's loaded copy via the `DFL` global. Use when Decky is running:
  bundling a second copy beside it runs `initModuleCache()` a second time in one session and kills the Quick Access
  browser view with `Minified React error #31`.

## Query parameters

| Parameter        | Effect                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adopt=1`        | rewrite the already-mounted QAM fiber so the patch takes effect without a reopen. **Required** — without it the patch is inert, because React flattens the QAM's `memo` at mount and the fiber no longer reads the module's `type`. |
| `icon=<name>`    | pick an asset from `assets/`, e.g. `logo.svg` or `logo-animated.gif`                                                                                                                                                                |
| `iconsize=<css>` | tab icon size, default `1.4em`                                                                                                                                                                                                      |

## Reading errors from the right place

The QAM renders in its own browser view, so an error there never reaches a listener on `SharedJSContext`. Attach one
inside its realm instead:

```js
DFL.getGamepadNavigationTrees().find((t) => t?.id === "QuickAccess-NA")
  ?.m_Root?.m_element?.ownerDocument?.defaultView;
```

It is replaced on every QAM remount and has to be re-attached, exactly like the patch.

## Desktop (#1866) — `spike/desktop.js`

Standalone functions, evaluated in `SharedJSContext`, no build step. They answered all seven questions of #1866 YES on
hardware. Each carries the trap that made it hard, in a comment above it:

| Function                         | Question                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `deskWin()`                      | the desktop client's own window — everything below needs it, because its document is a different realm |
| `reactClient()`                  | `createRoot` is NOT on `SP_REACTDOM` under React 19                                                    |
| `coverCandidates()`              | cover URLs are a candidate list, .jpg then .png, and only one exists                                   |
| `mountGamePanel()`               | 1, 2, 5 — our React panel in place of Steam's overview panel                                           |
| `watchNavigation()`              | 6 — survives page switches; needs an address watcher AND a DOM observer                                |
| `addMenuEntry()`                 | 3 — DOM, not React: an `afterPatch` on the menu element fires zero times                               |
| `openFullPage()` / `openModal()` | 4 — full-area page, or Steam's own modal                                                               |
| `mountRealPanel()`               | Tender's real QAM panel in the desktop; proved a full sync run works there                             |
| `watchRealmErrors()`             | read exceptions from the view that actually throws                                                     |

Two things break when the real panel is mounted, and both are listed at `mountRealPanel`: `WidePage` reaches for
gamepad-UI state that desktop mode does not have, and the panel's current page is module-level, so a page that throws
keeps throwing until `DeckyPluginLoader.importPlugin('Tender')` resets it.
