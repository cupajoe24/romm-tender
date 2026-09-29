---
paths:
  - "frontend/src/**"
  - "scripts/**"
---

# Steam UI Inspection and Standalone Runtime Rules

## 1. Steam DevTools Inspection Rule

When debugging, inspecting, or adapting to Steam client UI changes (such as Steam Desktop mode library overviews, play
bar elements, hashed CSS class names, or popup window hierarchies):

- **DO NOT** attempt to write automated scripts to scrape or probe the live CEF DOM autonomously.
- **DO NOT** make blind guesses about Steam's obfuscated class names or hierarchy.
- **ALWAYS ask the user for the active Steam DevTools inspector URL.** The user can navigate to the page and provide the
  exact DevTools inspector link, which is far faster and guaranteed to be accurate.

## 2. Standalone Architecture (No Decky Dependency)

- The frontend and backend run independently of Decky Loader.
- The bundle is loaded into Steam's `SharedJSContext` via the backend's CEF injector.
- Do not introduce runtime dependencies on Decky-specific globals (such as `window.DFL` or `@decky/manifest`) without
  safe fallbacks. The one deliberate dependency is `dist/index-coexistence.js`, which takes `@decky/ui` from `DFL` and
  is loaded only where Decky Loader is serving (`docs/architecture/frontend-bundles.md`, "Why two copies of the panel").
- After deploying rebuilt frontend bundles to a running Steam instance, Steam must be restarted so that its
  `SharedJSContext` is fresh and wipes `window.__tender_panel__`, allowing the backend injector to load the new bundle
  with the matching session token.

## 3. Desktop Mode DOM Adaptation

When working on desktop mode surfaces under `frontend/src/desktop/**` (dev build only — `pnpm -C frontend build:desktop`
is the one build that carries them):

- Read and follow [desktop-dom.md](desktop-dom.md).
- Architectural reference:
  [`docs/architecture/desktop-dom-architecture.md`](../../docs/architecture/desktop-dom-architecture.md).
- Enforce the ban on ephemeral minified class hashes (`_3fLo...`), require `DomRestorationLedger` tracking for all DOM
  mutations, keep React Fiber access read-only, and preserve the adaptation pass order before the substitute mount
  guard.
