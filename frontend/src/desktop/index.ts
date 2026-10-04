/**
 * Tender Steam Desktop client surface.
 *
 * This entry point starts the surface and exports its UI components. It is the
 * one place that decides what the navigation watcher draws, what the surface
 * offers the launch watcher, and when the Tender Settings menu entry is in place.
 * Per docs/architecture and desktop/README.md, this surface is a peer to bigpicture/,
 * shares data and logic from api/, utils/, and types/, and never imports from bigpicture/.
 */

import { GameView } from "./gameview/GameView";
import { PlayButton } from "./gameview/PlayButton";
import { offerDesktopLaunchPrompts, withdrawDesktopLaunchPrompts } from "./launchPromptHost";
import { startDesktopNavigationWatcher, stopDesktopNavigationWatcher, type DesktopGamePage } from "./navigationWatcher";
import { startTenderSettings, stopTenderSettings } from "./settings/settingsWindow";

const GAME_PAGE: DesktopGamePage = { gameView: GameView, playButton: PlayButton };

/**
 * Start the navigation watcher, offer the desktop dialogs to the launch watcher,
 * and put the Tender Settings entry in Steam's menu.
 */
export function startDesktopSurface(): void {
  stopDesktopSurface();
  offerDesktopLaunchPrompts();
  startDesktopNavigationWatcher(GAME_PAGE);
  startTenderSettings();
}

/**
 * Withdraw the desktop dialogs, settling any open question, stop the navigation
 * watcher, and take the Tender Settings entry and window away. Nothing in the dev
 * build calls it: a JS-context rebuild, not a teardown call, is what ends the panel.
 */
export function stopDesktopSurface(): void {
  withdrawDesktopLaunchPrompts();
  stopDesktopNavigationWatcher();
  stopTenderSettings();
}

export { appIdOf, type DesktopGamePage } from "./navigationWatcher";

export { openTenderSettings } from "./settings/settingsWindow";

export { findSteamOverviewPanel, TENDER_SUBSTITUTE_ID } from "./watcher/elementSelectors";

export { findDesktopWindow, findReactClient, coverCandidates, heroCandidates } from "./desktopWindow";

export { GameView, type GameViewProps } from "./gameview/GameView";
export { AboutHeader, type AboutHeaderProps } from "./gameview/AboutHeader";
export { AboutDetails, type AboutDetailsProps } from "./gameview/AboutDetails";
export { EmulationSettings, type EmulationSettingsProps } from "./gameview/EmulationSettings";
export {
  AchievementsCard,
  requestOpenAchievementsModal,
  consumeOpenAchievementsModal,
  type AchievementsCardProps,
} from "./gameview/AchievementsCard";
export { AchievementsModal, type AchievementsModalProps } from "./gameview/AchievementsModal";
export { MigrationBlockedCard, type MigrationBlockedCardProps } from "./gameview/MigrationBlockedCard";
