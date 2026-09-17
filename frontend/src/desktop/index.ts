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
export { AboutHeader, type AboutHeaderProps } from "./gameview/AboutHeader";
export { AboutDetails, formatReleaseDate, type AboutDetailsProps } from "./gameview/AboutDetails";
