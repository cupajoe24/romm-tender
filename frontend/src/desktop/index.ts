/**
 * Tender Steam Desktop client surface.
 *
 * This entry point exports the desktop navigation watcher and desktop UI components.
 * Per docs/architecture and desktop/README.md, this surface is a peer to bigpicture/,
 * shares data and logic from api/, utils/, and types/, and never imports from bigpicture/.
 */

export {
  startDesktopNavigationWatcher,
  stopDesktopNavigationWatcher,
  appIdOf,
  findSteamOverviewPanel,
  TENDER_SUBSTITUTE_ID,
} from "./navigationWatcher";

export { findDesktopWindow, findReactClient, coverCandidates } from "./desktopWindow";

export { GameView, GameViewPage, type GameViewProps, type GameViewPageProps } from "./gameview/GameView";
export { GameViewTabBar, type GameViewTabBarProps, type GameViewTab } from "./gameview/GameViewTabBar";
export { AboutHeader, type AboutHeaderProps } from "./gameview/AboutHeader";
export { AboutDetails, formatReleaseDate, type AboutDetailsProps } from "./gameview/AboutDetails";
export { EmulationSettings, type EmulationSettingsProps } from "./gameview/EmulationSettings";
export {
  AchievementsCard,
  requestOpenAchievementsModal,
  consumeOpenAchievementsModal,
  type AchievementsCardProps,
} from "./gameview/AchievementsCard";
export { AchievementsModal, type AchievementsModalProps } from "./gameview/AchievementsModal";
