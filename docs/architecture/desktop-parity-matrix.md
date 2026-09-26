# Desktop vs. Big Picture Feature Parity Matrix

A living architecture and tracking document comparing features implemented in the Steam Big Picture / Gamepad surface
(`frontend/src/bigpicture/` and `frontend/src/qam/`) against the Steam Desktop client surface (`frontend/src/desktop/`).

This document serves as the roadmap and reference for contributors and agents working towards full desktop feature
parity.

---

## Architectural Context & Surface Differences

| Dimension                       | Big Picture / Steam Deck Mode                                       | Desktop Client Mode                                                  |
| :------------------------------ | :------------------------------------------------------------------ | :------------------------------------------------------------------- |
| **Primary Input**               | Gamepad (D-pad, Joystick, A/B/X/Y)                                  | Mouse, Keyboard, Touch                                               |
| **Host Entry Point**            | Quick Access Menu (QAM) overlay + Game Detail route                 | Desktop Library Window (`vgui_root` / Library view)                  |
| **Injection Mechanism**         | React Fiber Tree Patcher (`createReactTreePatcher` via `@decky/ui`) | CEF DOM Watcher & React Root Mount (`startDesktopNavigationWatcher`) |
| **Dialog / Modal Host**         | Steam's native gamepad modal stack (`showModal()`)                  | Hand-rolled modals portaled into `deskWin.document.body`             |
| **Global Plugin Configuration** | QAM Tab (`QuickAccessRoot.tsx`, `SettingsPage.tsx`)                 | ❌ _Pending_ (No desktop settings window yet)                        |

---

## Feature Parity Matrix

### 1. In-Game Details View (`/library/app/<appId>`)

| Feature / Capability                 | Big Picture Implementation                                             | Desktop Implementation                                                     |     Status     | Notes & Roadmap                                                                      |
| :----------------------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------------- | :------------: | :----------------------------------------------------------------------------------- |
| **Host UI Injection & Mounting**     | `gameDetailPatch.tsx` replaces `AppDetailsOverviewPanel` in React tree | `navigationWatcher.ts` mounts dual React roots (`PlayButton` + `GameView`) | ✅ **Parity**  | Both inject cleanly without Decky Loader dependencies.                               |
| **Play / Download Button**           | `CustomPlayButton.tsx` (Action button container)                       | `PlayButton.tsx` (Replaces native Steam button)                            | ✅ **Parity**  | Supports Play, Download, Extracting, Launching, and Conflict states.                 |
| **Sticky Play Bar & Glassmorphism**  | Native Steam sticky header adaptation                                  | `stickyPlayBarController.ts` with pinned solid / glass transition          | ✅ **Parity**  | Clips hero wrapper canvas overflow (`overflow: hidden`).                             |
| **Game Information & Metadata**      | `AboutHeader.tsx` & `AboutDetails.tsx` (Steam deck style cards)        | `AboutHeader.tsx` & `AboutDetails.tsx` (`desktop/gameview/`)               | ✅ **Parity**  | Developer, publisher, release date, genres, description.                             |
| **Multi-Disc & Variant Selector**    | `DiscSelector.tsx`                                                     | `DiscSelector.tsx` (`desktop/gameview/`)                                   | ✅ **Parity**  | Disc switching, variant selection, file list display.                                |
| **Save Management (Cloud / Local)**  | `SaveManagementCard.tsx` + slot modals                                 | `SaveManagementCard.tsx` (`desktop/gameview/`)                             | ✅ **Parity**  | Slot switching, server vs. local status, download/upload.                            |
| **Emulation & Core Selection**       | `EmulationSettings.tsx` + `CoreChangeModal.tsx`                        | `EmulationSettings.tsx` (`desktop/gameview/`)                              | ⚠️ **Partial** | Desktop displays core/standalone configs, but core picker modal is not yet portaled. |
| **Achievements Display & Modal**     | `AchievementsCard.tsx` + `AchievementsModal.tsx`                       | `AchievementsCard.tsx` + `AchievementsModal.tsx`                           | ✅ **Parity**  | Unlocked/locked breakdown, progress bar, portaled desktop modal.                     |
| **File Adoption & Conflict Dialogs** | `AdoptCandidateModal`, `AdoptCollisionModal`, etc.                     | `dialogs/DesktopAdoptDialogs.tsx`, `DesktopSaveConflictDialog.tsx`         | ✅ **Parity**  | Surface-independent logic in `utils/adoptFlow.ts` and `saveConflictFlow.ts`.         |
| **RetroDECK Path Migration Alert**   | `MigrationBlockedCard.tsx` (Card alert in game detail)                 | ❌ _Not Implemented_                                                       | ❌ **Missing** | Need to render warning card in desktop `GameView` when migration is blocked.         |
| **Remote Play & Session Scope**      | `PlaytimeScopeBanner.tsx` & `sessionManager.ts`                        | ❌ _Not Implemented_                                                       | ❌ **Missing** | Need banner component in `GameView` alerting to active session on another device.    |
| **Offline Drift / Unsynced Warning** | `OfflineDriftModal.tsx`, `UnsyncedSavesSwitchModal.tsx`                | ❌ _Not Implemented_                                                       | ❌ **Missing** | Fallback launch confirmations when offline saves differ from server.                 |

---

### 2. Global Library, Sync & Settings

| Feature / Capability                 | Big Picture Implementation                                        | Desktop Implementation |     Status     | Notes & Roadmap                                                                     |
| :----------------------------------- | :---------------------------------------------------------------- | :--------------------- | :------------: | :---------------------------------------------------------------------------------- |
| **RomM Connection Settings**         | `ConnectionSection.tsx` (Host URL, Username, Password, Token)     | ❌ _Not Implemented_   | ❌ **Missing** | No desktop settings UI exists. Currently configured via BPM QAM or CLI.             |
| **SteamGridDB API Key & Settings**   | `SteamGridDBSection.tsx` & `SgdbApiKeyModal.tsx`                  | ❌ _Not Implemented_   | ❌ **Missing** | Needs desktop input dialog or settings tab.                                         |
| **Save Sync Global Options**         | `SaveSyncSection.tsx` (Auto-upload, slot limits, conflict policy) | ❌ _Not Implemented_   | ❌ **Missing** | Currently inherits settings configured in BPM/backend.                              |
| **Library Browser & Full Sync**      | `LibraryPage.tsx` (Browse RomM library, trigger full sync)        | ❌ _Not Implemented_   | ❌ **Missing** | Users cannot browse uninstalled RomM games from Steam Desktop.                      |
| **BIOS & Firmware Manager**          | `BiosManagementPage.tsx` (Audit cores, missing BIOS, download)    | ❌ _Not Implemented_   | ❌ **Missing** | Comprehensive BIOS audit currently restricted to Big Picture.                       |
| **Data Management & Cache Pruning**  | `DataManagementPage.tsx` (Prune old saves, delete cached art)     | ❌ _Not Implemented_   | ❌ **Missing** | Bulk cache cleanup not yet surfaced in desktop.                                     |
| **Download Queue & Active Progress** | `DownloadProgressRow.tsx`, `downloadStore.ts`                     | ⚠️ **Partial**         | ⚠️ **Partial** | Individual game progress renders on desktop `PlayButton`, but no global queue list. |
| **Controller & Emulator Overrides**  | `ControllerSection.tsx`, `AdvancedSection.tsx`                    | ❌ _Not Implemented_   | ❌ **Missing** | Global RetroDECK emulator mapping and controller profile tweaks.                    |

---

## Development Roadmap for Desktop Parity

### Phase 1: In-Page Game Detail Completeness (High Priority)

Enhance the existing desktop `GameView` (`frontend/src/desktop/gameview/`) to match all Big Picture game-page banners
and alerts:

1. **Migration & Path Alerts**:
   - Port `MigrationBlockedCard.tsx` into `desktop/gameview/MigrationBlockedCard.tsx`.
   - Render atop `GameView` when `migrationStore` reports active path blocks.
2. **Session & Remote Play Scope Banners**:
   - Port `PlaytimeScopeBanner.tsx` into `desktop/gameview/PlaytimeScopeBanner.tsx`.
   - Subscribe to `sessionManager.ts` to warn when the same game is active on another device.
3. **Core Selection Modal**:
   - Create a desktop portaled equivalent of `CoreChangeModal.tsx` allowing users to switch emulator cores directly from
     `desktop/gameview/EmulationSettings.tsx`.
4. **Offline Drift & Save Switch Dialogs**:
   - Create portaled desktop dialogs for `OfflineDriftModal` and `UnsyncedSavesSwitchModal` invoked by `PlayButton`.

### Phase 2: Global Settings Access in Desktop Mode (Medium Priority)

Provide a way to access plugin settings without requiring Big Picture / Steam Deck Game Mode:

1. **Desktop Entry Point**:
   - Add a settings button to the desktop play bar (e.g. gear icon in `desktop/gameview/AboutHeader.tsx` or adjacent to
     right controls) or a persistent menu bar hook.
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
