---
paths:
  - "frontend/src/desktop/**"
---

# Desktop Mode DOM Adaptation & Lifecycle Rules

## 1. Ban on Ephemeral Minified CSS Class Hashes

- **Never** hardcode ephemeral Webpack hashes (e.g. `_3fLoY...`, `_3by_V...`). These hashes change arbitrarily with
  Steam client updates.
- Always resolve elements using the multi-tier ladder in `watcher/elementSelectors.ts`:
  1. CSS module tokens from `deckyUiInternals` (`appDetailsClasses`, `appActionButtonClasses`).
  2. Read-only React Fiber component names (`displayName`, `name`).
  3. Structural landmark attributes (`role="main"`, `aria-label`).
  4. Structural ancestor / sibling tree walks.

## 2. Mandatory Atomic Restoration

- **Never** perform untracked DOM mutations. Injected inline styles, hidden elements, attached event listeners, and
  mounted React roots must be recorded via `DomRestorationLedger`.
- Direct element assignments (e.g. bare `el.style.display = "none"` or `el.style.overflow = "hidden"`) or untracked
  `addEventListener` calls are strictly prohibited.
- All adaptations must tear down cleanly via `ledger.restoreAll()` on route changes, non-RomM navigation, or window
  close.

## 3. Read-Only React Fiber Introspection

- Desktop plugin code runs from `SharedJSContext` while targeting the desktop library CEF window — two distinct
  execution realms.
- Treat all `__reactFiber$` structures as strictly read-only inspection surfaces.
- **Never** modify Fiber properties, hooks, state, or linked lists, and never invoke React reconciler methods across
  window boundaries.

## 4. Continuous Adaptation Pass Order Invariant

- Steam renders hero banner background canvases and play bar badges asynchronously (100–500ms after initial DOM mount).
- In `reinject()`, continuous layout adaptations (synchronizing hero wrapper overflow with pinning state, hiding native
  badges, suppressing duplicate sticky bars, aligning right controls) **must execute before** checking if
  `existingSubstitute` is already mounted.
- The `existingSubstitute` check (`dataset.appid === appId`) must **only** gate React root instantiation
  (`client.createRoot` / `render`).
- The hero wrapper's overflow must remain `visible` throughout scroll so the hero banner continues to scroll in 3D
  parallax on `z-index: -1000` behind the play bar and subsequent cards, creating the artwork refraction and
  bleed-through effect.
- Placing the `existingSubstitute` early return above DOM adaptations silently skips ongoing adaptations and
  late-mounting elements.
- Continuous watcher polling (`checkNav`) must invoke `reinject()` on interval even when `isMountedForCurrent` is true
  to catch asynchronous background canvas renders and layout updates.

## 5. Hero Banner 3D Parallax & Glass Refraction Invariant

- Steam Desktop achieves its signature hero banner parallax using CSS 3D transforms:
  - Scroll container: `perspective: 1px`, `overflow-y: scroll`.
  - Hero wrapper ancestors: `transform-style: preserve-3d`, `overflow: visible`.
  - Hero image: `transform: matrix3d(...)` (`scale(2) translateZ(-1px)`), positioned on `z-index: -1000`.
  - Play bar & cards: semi-transparent glass (`backdrop-filter: blur(12px)`) positioned on `z-index: 10` and
    `z-index: 1`.
- **Never set `overflow: hidden` on the hero wrapper**: setting `overflow: hidden` on any ancestor flattens CSS 3D
  transforms (`preserve-3d` -> `flat`), destroying the 0.5x parallax motion, and clips the hero image at its container
  height (~307px), preventing it from bleeding behind the play bar and cards.
- The hero wrapper must strictly maintain `overflow: visible` across both unpinned and pinned scroll states so the
  artwork continues to scroll in the background behind the remaining cards.
