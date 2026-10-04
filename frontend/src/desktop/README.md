# `desktop/` — the desktop-client surface

This directory is where the desktop client's UI goes. It is the peer of `bigpicture/`, which holds the gamepad surface —
the QAM panel and the patch into Steam's game-detail route.

**Dev build only.** Nothing here reaches a shipped bundle; see [below](#what-reaches-a-bundle).

## Directory Organization

Following the conventions of `bigpicture/`, shared files live at the root of `desktop/`, and view-specific components
are sorted into dedicated lowercase subdirectories:

- `desktop/` (root) — Shared desktop infrastructure:
  - `desktopWindow.ts` — finding the desktop client window, React 19's `createRoot`, cover and hero candidate URLs.
  - `navigationWatcher.ts` — watches the desktop client's location and DOM, adapts Steam's game page and mounts the
    views it is given (`DesktopGamePage`); it imports no view.
  - `launchPromptHost.tsx` — draws a question of the launch watcher's into the desktop window, each in a React root of
    its own
    ([Dialogs for a start the launch watcher catches](../../../docs/architecture/desktop-dom-architecture.md#dialogs-for-a-start-the-launch-watcher-catches)).
  - `index.ts` — Public surface exports, and `startDesktopSurface` / `stopDesktopSurface`: the one place that hands the
    watcher `GameView` and `PlayButton`, offers this surface's dialogs to the launch watcher, and starts and stops the
    Tender Settings window's menu entry.
- `desktop/watcher/` — what the navigation watcher adapts Steam's page with: `elementSelectors.ts` (finding Steam's
  elements), `fiberInspector.ts` (read-only Fiber reads), `restorationLedger.ts` (recording every change so it can be
  undone), `stickyPlayBarController.ts` (the play bar's pinned and glass states).
- `desktop/gameview/` — `GameView` and what it renders: `AboutDetails`, `EmulationSettings`, `SaveManagementCard`,
  `AchievementsCard`/`AchievementsModal`, `MigrationBlockedCard`, `PlaytimeScopeBanner`; and the play bar's `PlayButton`
  with `PlayStateButton`, `PlayButtonBadges`, `DownloadingButton`, `DiscSelector` and `usePlayLaunch`. `AboutHeader.tsx`
  is exported but not rendered anywhere.
  - `desktop/gameview/dialogs/` — the game page's dialogs, drawn for the desktop client over the flows and words in
    `utils/` (`adoptFlow.ts`, `adoptWording.ts`, `launchPromptWording.ts`, `saveConflictFlow.ts`, `saveHelpers.ts`): the
    already-on-your-device dialogs a Download press opens, the save-conflict dialog, the launch dialogs (offline drift,
    fallback launch, core change, unsynced saves) and the slot dialogs. `DesktopDialog.tsx` is the frame they share,
    `desktopDialogs.tsx` puts them in the shapes the shared flows ask for (`desktopLaunchPrompts` for a launch), and
    `useDialogHost.tsx` is how a component asks one: a promise that settles with the button pressed, and with the
    dialog's cancel answer on Escape, a backdrop click or unmount. A start from Tender's Play button asks through the
    launch dialogs, and so does a start the launch watcher catches (`utils/launchInterceptor.ts`) while the desktop
    client is Steam's main UI.
- `desktop/gamesettings/` — (Planned) `GameSettingsView` specific components.
- `desktop/settings/` — the Tender Settings window and its entry in Steam's "Steam" menu
  ([The Tender Settings Window](../../../docs/architecture/desktop-dom-architecture.md#the-tender-settings-window)):
  `settingsWindow.tsx` (`openTenderSettings`, and `startTenderSettings` / `stopTenderSettings`, which keep the menu
  entry in place and close and reopen the window with the library window), `TenderSettingsWindow.tsx` (the window, from
  the parts `steamSettingsParts.ts` finds in Steam), `settingsMenuEntry.ts` (the menu item) and `tabs.tsx` (the tabs'
  order, groups, labels and icons; every tab is blank).

## What reaches a bundle

`rollup.config.js` builds the panel from `./src/index.tsx` — the module that mounts the bigpicture surface — and nothing
there imports this directory, so `pnpm build`, `build:dev`, CI and the release tarball ship none of it. The one build
that does is `build:desktop` (`rollup.desktop.config.js`), which rewrites `index.tsx` as it is bundled to call
`startDesktopSurface()`
([the desktop dev build](../../../docs/architecture/frontend-bundles.md#the-desktop-dev-build-dev-build-only)).

It is checked all the same, and each check has its own reason: `pnpm lint` runs `eslint .` over the frontend package,
and `tsconfig.json` includes the whole of `src`, so a file here is linted and type-checked wherever it sits. Vitest is
the one to read carefully — it collects only `*.{test,spec}.{ts,tsx}`, so a plain module here runs in no test, but it
does fall inside the coverage include glob (`src/**/*.{ts,tsx}` in `vitest.config.ts`), which is what puts an untested
file on the coverage report.

The two are **peers, not layers**. They share data and logic and almost nothing visual: the same reads, the same stores,
the same vocabulary, drawn for a controller on one side and for a keyboard and mouse on the other.

## What this surface may import

- `../shared/` — UI that belongs to both surfaces, such as the disc glyphs `gameview/DiscSelector.tsx` draws
- `../api/` — the wire to the backend (endpoints and events)
- `../utils/` — shared logic and the module stores
- `../types/` — the shared wire and domain types

## What it may not

- Nothing here may import from `../bigpicture/`, and nothing there may import from here.
- Nothing in `../shared/` may import from here.

Anything that turns out to belong to both surfaces moves **down** — UI into `shared/`, the rest into `api/`, `utils/` or
`types/` — never sideways. Enforced by `import-x/no-restricted-paths` in `eslint.config.js`, whose zones are held to
reporting by `../eslintBoundaries.test.ts`.

## Development and testing

The desktop dev loop — building with `build:desktop`, pushing to a Deck or another Linux machine with
`scripts/dev_push_remote.{ps1,sh}`, and inspecting the desktop window in DevTools — is in
[Frontend dev loop](../../../docs/contributing/frontend-dev-loop.md#desktop-client-ui-dev-loop-dev-build-only).
