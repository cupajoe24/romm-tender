import { type FC } from "react";
import { useGameDetail } from "../utils/gameDetailStore";
import { useRomMetadata } from "../utils/useRomMetadata";
import { resolveAppTitle } from "../utils/steamOverview";
import { coverCandidates } from "./desktopWindow";
import { AboutHeader } from "./AboutHeader";
import { AboutDetails } from "./AboutDetails";

export interface GameViewPageProps {
  appId: number;
}

export const GameViewPage: FC<GameViewPageProps> = ({ appId }) => {
  const detail = useGameDetail(appId);
  const metadata = useRomMetadata(detail.romId);
  const title = resolveAppTitle(appId, detail.romName);
  const covers = coverCandidates(appId);

  return (
    <div
      className="tender-desktop-game-view"
      style={{
        padding: "24px",
        backgroundColor: "#16202d",
        borderRadius: "8px",
        color: "#c7d5e0",
      }}
    >
      <AboutHeader />
      <AboutDetails
        title={title}
        {...(detail.platformSlug ? { platformName: detail.platformSlug } : {})}
        metadata={metadata}
        covers={covers}
      />
    </div>
  );
};
