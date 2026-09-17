# `desktop/` — the desktop-client surface

This directory is where the desktop client's UI goes. It is the peer of `bigpicture/`, which holds the gamepad surface —
the QAM panel and the patch into Steam's game-detail route.

### Directory Organization

Following the conventions of `bigpicture/`, shared files live at the root of `desktop/`, and view-specific components
are sorted into dedicated lowercase subdirectories:

- `desktop/` (root) — Shared desktop infrastructure:
  - `desktopWindow.ts` — Window discovery, React 19 root resolution, cover candidate URLs.
  - `navigationWatcher.ts` — Watches desktop client location/DOM and mounts views.
  - `index.ts` — Public surface exports.
- `desktop/gameview/` — `GameView` specific files (`GameView.tsx`, `AboutHeader.tsx`, `AboutDetails.tsx`).
- `desktop/gamesettings/` — (Planned) `GameSettingsView` specific components.
- `desktop/settings/` — (Planned) `TenderSettings` specific components.

**Nothing here reaches the shipped bundle.** `rollup.config.js` sets one entry, `./frontend/src/index.tsx` — the module
that mounts the bigpicture surface — so a file added here ships nowhere until someone imports it from a bundled module
or gives this surface an entry of its own. It is checked all the same, and each check has its own reason: `pnpm lint`
runs `eslint .` over the repository, and `tsconfig.json` includes the whole of `frontend/src`, so a file here is linted
and type-checked wherever it sits. Vitest is the one to read carefully — it collects only `*.{test,spec}.{ts,tsx}`, so a
plain module here runs in no test, but it does fall inside the coverage include glob (`frontend/src/**/*.{ts,tsx}` in
`vitest.config.ts`), which is what puts an untested file on the coverage report.

The two are **peers, not layers**. They share data and logic and almost nothing visual: the same reads, the same stores,
the same vocabulary, drawn for a controller on one side and for a keyboard and mouse on the other.

## What this surface may import

- `../api/` — the callable wire to the backend
- `../utils/` — shared logic and the module stores
- `../types/` — the shared wire and domain types

## What it may not

- Nothing here may import from `../bigpicture/`, and nothing there may import from here.

Anything that turns out to belong to both surfaces moves **down** into `api/`, `utils/` or `types/` — never sideways.
Enforced by `import-x/no-restricted-paths` in `eslint.config.js`, whose zones are held to reporting by
`../eslintBoundaries.test.ts`.

## Development and testing

While the shipped production bundle (`pnpm build`) only mounts the Big Picture surface, a dedicated dev build target and
push scripts allow iterating on the desktop UI:

- **Build desktop dev bundle**:
  ```bash
  pnpm run build:desktop
  ```
  Uses `rollup.desktop.config.js`. It enables sourcemaps and injects the desktop navigation watcher
  (`startDesktopNavigationWatcher` / `stopDesktopNavigationWatcher`) into the bundle at build time, without modifying
  `frontend/src/index.tsx` on disk.

- **Deploy to Steam Deck**: Push the bundle to a Steam Deck in Desktop Mode over SSH:
  - **PowerShell (Windows)**:
    ```powershell
    .\scripts\dev_push_deck.ps1 -DeckHost <deck-ip>
    # One-time setup: .\scripts\dev_push_deck.ps1 -DeckHost <deck-ip> -SetupDeck
    # Push backend:   .\scripts\dev_push_deck.ps1 -DeckHost <deck-ip> -PushBackend
    ```
  - **Bash (Linux/macOS)**:
    ```bash
    ./scripts/dev_push_deck.sh <deck-ip>
    # One-time setup: ./scripts/dev_push_deck.sh <deck-ip> --setup-deck
    # Push backend:   ./scripts/dev_push_deck.sh <deck-ip> --push-backend
    ```

- **Remote debugging**: With remote CEF debugging enabled on the Deck, open `http://<deck-ip>:8081` in Chrome or Edge:
  - `SharedJSContext` — plugin runtime and console logs.
  - Desktop client window — inspect DOM structure and elements mounted by desktop views.
