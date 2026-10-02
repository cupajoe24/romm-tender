# Desktop vs. Big Picture Feature Parity Matrix

A living architecture and tracking document comparing features implemented in the Steam Big Picture / Gamepad surface
(`frontend/src/bigpicture/` and `frontend/src/qam/`) against the Steam Desktop client surface (`frontend/src/desktop/`).

This document serves as the roadmap and reference for contributors and agents working towards full desktop feature
parity.

> **Dev build only.** Every "Desktop Implementation" below exists in the source tree and reaches Steam only through
> `pnpm -C frontend build:desktop` ([the desktop dev build](frontend-bundles.md#the-desktop-dev-build-dev-build-only)).
> No shipped bundle carries it, so for an installed release every desktop row is still missing.

---

## Architectural Context & Surface Differences

| Dimension                       | Big Picture / Steam Deck Mode                                                  | Desktop Client Mode                                                                                                                                                                                                                                                                        |
| :------------------------------ | :----------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary Input**               | Gamepad (D-pad, Joystick, A/B/X/Y)                                             | Mouse, Keyboard, Touch                                                                                                                                                                                                                                                                     |
| **Host Entry Point**            | Quick Access entry (`qam/quickAccessEntry.tsx`) + Game Detail route            | Desktop library window (the `SP Desktop …` popup)                                                                                                                                                                                                                                          |
| **Injection Mechanism**         | Route patch through `createReactTreePatcher` (`bigpicture/patches/`)           | DOM watcher mounting React roots (`startDesktopNavigationWatcher`)                                                                                                                                                                                                                         |
| **Dialog / Modal Host**         | Steam's gamepad modal stack (`showModal()`)                                    | `DesktopDialog`, portaled into the desktop window's `document.body`; a start from Tender's Play button asks through it (`desktopLaunchPrompts`), while any other start (the launch watcher, `utils/launchInterceptor.ts`) asks through `shared/`'s gamepad modals (`gamepadLaunchPrompts`) |
| **Global Plugin Configuration** | Settings page (`SettingsPage.tsx`, `bigpicture/settings/*`) behind the QAM tab | ❌ _Pending_ (No desktop settings window yet)                                                                                                                                                                                                                                              |

---

## Feature Parity Matrix

### 1. In-Game Details View (`/library/app/<appId>`)

| Feature / Capability                 | Big Picture Implementation                                                                       | Desktop Implementation                                                                                                                    |    Status     | Notes & Roadmap                                                                                                                                                                                                                                                     |
| :----------------------------------- | :----------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :-----------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Host UI Injection & Mounting**     | `gameDetailPatch.tsx` replaces `AppDetailsOverviewPanel` in the React tree                       | `navigationWatcher.ts` mounts two React roots (`PlayButton` in the play bar, `GameView` below it)                                         | ✅ **Parity** | Desktop `GameView` is a two-column grid (`2fr 1fr`): About and Emulation on the left, Saves and Achievements on the right.                                                                                                                                          |
| **Play / Download Button**           | `CustomPlayButton.tsx` inside `RomMPlaySection.tsx`                                              | `PlayButton.tsx` (replaces the native Steam button)                                                                                       | ✅ **Parity** | Download, Downloading (incl. queued and extracting), Use Existing Files, Play, Syncing, Launching, and Resolve Conflict states.                                                                                                                                     |
| **Sticky Play Bar & Glassmorphism**  | Native Steam sticky header                                                                       | `watcher/stickyPlayBarController.ts` with pinned solid / unpinned glass transition                                                        | ✅ **Parity** | Keeps the hero wrapper at `overflow: visible` so the banner parallaxes behind the glass bar and cards.                                                                                                                                                              |
| **Game Information & Metadata**      | `GameInfoTab.tsx` (in `RomMGameInfoPanel.tsx`)                                                   | `AboutDetails.tsx` (`desktop/gameview/`)                                                                                                  | ✅ **Parity** | Developer, publisher, release date, genres, description. `AboutHeader.tsx` exists but nothing renders it.                                                                                                                                                           |
| **Multi-Disc & Variant Selector**    | `DiscSelector.tsx`, `VersionPicker.tsx`                                                          | `DiscSelector.tsx` (`desktop/gameview/`)                                                                                                  | ✅ **Parity** | Disc switching, variant selection, file list display. Both pickers draw the disc glyphs from `shared/DiscGlyphs.tsx` over `utils/discSelection.ts`.                                                                                                                 |
| **Save Management (Cloud / Local)**  | `SavesTab.tsx` + `bigpicture/saves/*` and slot modals                                            | `SaveManagementCard.tsx` + `DesktopNewSlotDialog`, `DesktopCopySlotDialog`, `DesktopDeleteSlotDialog`                                     | ✅ **Parity** | Slot switching, server vs. local status, download/upload.                                                                                                                                                                                                           |
| **Emulation & Core Selection**       | Core picker in `RomMPlaySection.tsx`; `shared/CoreChangeModal.tsx` before launch                 | `EmulationSettings.tsx` (in-card emulator picker); `DesktopCoreChangeDialog.tsx` before a Play-button launch                              | ✅ **Parity** | Both pickers apply through `utils/coreOverride.ts`; on desktop, picking the pinned emulator unpins it. Both core-change prompts take their words from `utils/launchPromptWording.ts`.                                                                               |
| **Achievements Display & Modal**     | `AchievementsTab.tsx`                                                                            | `AchievementsCard.tsx` + `AchievementsModal.tsx`                                                                                          | ✅ **Parity** | Unlocked/locked breakdown, progress bar, portaled desktop modal. Shown only for a ROM with a RetroAchievements id.                                                                                                                                                  |
| **File Adoption & Conflict Dialogs** | `Adopt*Modal.tsx` (five), `shared/SyncConflictModal.tsx`                                         | `DesktopAdoptCandidatesDialog`, `…CollisionsDialog`, `…ExistingDialog`, `…UnusableDialog`, `…VanishedDialog`, `DesktopSaveConflictDialog` | ✅ **Parity** | Surface-independent logic in `utils/adoptFlow.ts`, `utils/adoptWording.ts` and `utils/saveConflictFlow.ts`.                                                                                                                                                         |
| **RetroDECK Path Migration Alert**   | `MigrationBlockedCard.tsx` (card alert in game detail)                                           | `MigrationBlockedCard.tsx` (`desktop/gameview/`)                                                                                          | ✅ **Parity** | Renders an amber warning card atop desktop `GameView` while a migration is pending.                                                                                                                                                                                 |
| **Offline Drift / Unsynced Warning** | `shared/OfflineDriftModal.tsx`, `shared/FallbackLaunchModal.tsx`, `UnsyncedSavesSwitchModal.tsx` | `DesktopOfflineDriftDialog.tsx`, `DesktopFallbackLaunchDialog.tsx` before a Play-button launch; `DesktopUnsyncedSavesDialog.tsx`          | ✅ **Parity** | Offline drift warning, retry loop, fallback launch, and unsynced save switch. A start the launch watcher catches (`utils/launchInterceptor.ts`) asks through `shared/`'s modals on desktop too. Both drawings take their words from `utils/launchPromptWording.ts`. |

---

### 2. Global Library, Sync & Settings

| Feature / Capability                 | Big Picture Implementation                                         | Desktop Implementation |     Status     | Notes & Roadmap                                                                     |
| :----------------------------------- | :----------------------------------------------------------------- | :--------------------- | :------------: | :---------------------------------------------------------------------------------- |
| **RomM Connection Settings**         | `ConnectionSection.tsx` (Host URL, Username, Password, Token)      | ❌ _Not Implemented_   | ❌ **Missing** | No desktop settings UI exists. Configured through the Big Picture settings page.    |
| **SteamGridDB API Key & Settings**   | `SteamGridDBSection.tsx` & `SgdbApiKeyModal.tsx`                   | ❌ _Not Implemented_   | ❌ **Missing** | Needs desktop input dialog or settings tab.                                         |
| **Save Sync Global Options**         | `SaveSyncSection.tsx` (Auto-upload, slot limits, conflict policy)  | ❌ _Not Implemented_   | ❌ **Missing** | Currently inherits settings configured in Big Picture.                              |
| **Library Browser & Full Sync**      | `LibraryPage.tsx`, `SyncPage.tsx`                                  | ❌ _Not Implemented_   | ❌ **Missing** | Users cannot browse uninstalled RomM games from Steam Desktop.                      |
| **BIOS & Firmware Manager**          | `BiosTab.tsx`, `library/PlatformsTab.tsx` / `PlatformDetail.tsx`   | ❌ _Not Implemented_   | ❌ **Missing** | The desktop Emulation card shows one ROM's BIOS summary; no platform-wide view.     |
| **Data Management & Cache Pruning**  | `DataManagementPage.tsx`, `RemovedGamesCleanup.tsx`                | ❌ _Not Implemented_   | ❌ **Missing** | Bulk cache cleanup not yet surfaced in desktop.                                     |
| **Download Queue & Active Progress** | `DownloadQueue.tsx`, `DownloadProgressRow.tsx`, `downloadStore.ts` | ⚠️ **Partial**         | ⚠️ **Partial** | Individual game progress renders on desktop `PlayButton`, but no global queue list. |
| **Controller & Emulator Overrides**  | `ControllerSection.tsx`, `AdvancedSection.tsx`                     | ❌ _Not Implemented_   | ❌ **Missing** | Global RetroDECK emulator mapping and controller profile tweaks.                    |

---

## Development Roadmap for Desktop Parity

### Phase 0: Ship the Desktop Surface

Nothing below reaches a user until the watcher is started from the production entry (`src/index.tsx`) rather than added
by `build:desktop` at build time.

### Phase 1: In-Page Game Detail Completeness (High Priority)

Enhance the existing desktop `GameView` (`frontend/src/desktop/gameview/`) to match all Big Picture game-page banners
and alerts:

1. **Migration & Path Alerts** (✅ Completed):
   - `desktop/gameview/MigrationBlockedCard.tsx`, rendered atop `GameView` when `migrationStore` reports a pending
     migration.
2. **Session & Playtime Scope Banners** (✅ Completed):
   - `desktop/gameview/PlaytimeScopeBanner.tsx`: an active-session banner (from `sessionManager.ts` and
     `romm_session_changed`) and the cross-device playtime re-sign-in banner (from `playtimeScopeStore.ts`).
3. **Core Selection** (✅ Completed):
   - In-card emulator picker in `desktop/gameview/EmulationSettings.tsx`, and `DesktopCoreChangeDialog.tsx` before a
     Play-button launch whose core changed.
4. **Offline Drift & Save Switch Dialogs** (✅ Completed):
   - `DesktopOfflineDriftDialog.tsx`, `DesktopFallbackLaunchDialog.tsx` and `DesktopUnsyncedSavesDialog.tsx`, wired to
     `PlayButton.tsx` and `DiscSelector.tsx`.

### Phase 2: Global Settings Access in Desktop Mode (Medium Priority)

Provide a way to access plugin settings without requiring Big Picture / Steam Deck Game Mode:

1. **Desktop Entry Point**:
   - Add a settings button to the desktop play bar (e.g. a gear icon beside the right controls) or a persistent menu bar
     hook.
2. **Portaled Settings Modal (`desktop/settings/DesktopSettingsModal.tsx`)**:
   - Mount a multi-tab settings dialog portaled to `deskWin.document.body`.
   - Host `ConnectionSection`, `SteamGridDBSection`, `SaveSyncSection`, and `ControllerSection`.

### Phase 3: Standalone Library, BIOS & Data Management (Long-term)

Surface full RomM catalog browsing and maintenance tools on desktop:

1. **Desktop Library Browser Window / Overlay**:
   - Explore opening a dedicated standalone window or full-page tab for browsing un-synced RomM titles and queuing batch
     installs.
2. **BIOS Management View**:
   - Expose the firmware audit and missing BIOS downloader within the desktop settings or a dedicated diagnostic tool.
3. **Data Management View**:
   - Expose cache pruning, un-synced save cleanup, and artwork repair tools.

---

## Maintenance Guidelines

- When adding or modifying features in `frontend/src/bigpicture/`, check this matrix to determine if a corresponding
  desktop implementation is needed.
- Update this file in the same PR whenever desktop parity status changes.
