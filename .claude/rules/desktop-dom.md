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
  3. Stable semantic / ARIA selectors (`button[aria-label="Play Game"]`, `[role="tab"]`).
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
- In `reinject()`, continuous layout containment (clipping hero wrapper overflow, hiding native badges, suppressing
  duplicate sticky bars, aligning right controls) **must execute before** checking if `existingSubstitute` is already
  mounted.
- The `existingSubstitute` check (`dataset.appid === appId`) must **only** gate React root instantiation
  (`client.createRoot` / `render`).
- Placing the `existingSubstitute` early return above DOM adaptations silently disables hero banner canvas overflow
  clipping, allowing canvases to inflate `scrollHeight` from 307px to 1978px and creating a massive empty gap below
  content.
- Continuous watcher polling (`checkNav`) must invoke `reinject()` on interval even when `isMountedForCurrent` is true
  to catch asynchronous background canvas renders.
