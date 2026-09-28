import { useEffect, type FC, type CSSProperties } from "react";
import { useGameDetail } from "../../utils/gameDetailStore";
import { useRomMetadata } from "../../utils/useRomMetadata";
import { coverCandidates } from "../desktopWindow";
import { useAutoArtwork } from "../../utils/autoArtwork";
import { registerConnectionHeartbeat } from "../../utils/connectionHeartbeat";
import { resolveAppTitle } from "../../utils/steamOverview";
import { useMigrationStatus } from "../../utils/migrationStore";
import { AboutDetails } from "./AboutDetails";
import { AchievementsCard } from "./AchievementsCard";
import { EmulationSettings } from "./EmulationSettings";
import { SaveManagementCard } from "./SaveManagementCard";
import { PlayButton } from "./PlayButton";
import { MigrationBlockedCard } from "./MigrationBlockedCard";
import { PlaytimeScopeBanner } from "./PlaytimeScopeBanner";
import { CARD_STYLE } from "./styles";

export interface GameViewProps {
  appId: number;
  showPlayButton?: boolean;
}

export type GameViewPageProps = GameViewProps;

export const COLUMNS_CONTAINER_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr",
  gap: "16px",
  alignItems: "start",
};

export const LEFT_COLUMN_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  minWidth: 0,
};

export const RIGHT_COLUMN_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  minWidth: 0,
};

export const GameView: FC<GameViewProps> = ({ appId, showPlayButton }) => {
  const detail = useGameDetail(appId);
  const migration = useMigrationStatus();

  useEffect(() => registerConnectionHeartbeat(), []);
  useAutoArtwork(appId, detail.romId, "Desktop auto-artwork error");

  const metadata = useRomMetadata(detail.romId);
  const title = resolveAppTitle(appId, detail.romName);
  const covers = coverCandidates(appId);

  return (
    <div
      className="tender-desktop-game-view tender-desktop-cards-container"
      style={{
        marginTop: "16px",
        marginBottom: "24px",
      }}
    >
      {migration.pending && (
        <div className="tender-desktop-migration-alert-container" style={{ marginBottom: "16px" }}>
          <MigrationBlockedCard />
        </div>
      )}
      <PlaytimeScopeBanner appId={appId} romId={detail.romId} />
      {showPlayButton && (
        <div style={{ marginBottom: "16px" }}>
          <PlayButton appId={appId} />
        </div>
      )}
      <div className="tender-desktop-columns-container" style={COLUMNS_CONTAINER_STYLE}>
        <div className="tender-desktop-left-column tender-desktop-game-info-column" style={LEFT_COLUMN_STYLE}>
          <div className="tender-desktop-about-card tender-desktop-info-card" style={CARD_STYLE}>
            <AboutDetails
              title={title}
              platformName={detail.platformSlug || undefined}
              metadata={metadata}
              covers={covers}
            />
          </div>
          {detail.romId && detail.raId ? (
            <AchievementsCard appId={appId} romId={detail.romId} raId={detail.raId} title={title} covers={covers} />
          ) : null}
        </div>
        <div className="tender-desktop-right-column tender-desktop-emulation-column" style={RIGHT_COLUMN_STYLE}>
          <SaveManagementCard appId={appId} romId={detail.romId} detail={detail} />
          <div className="tender-desktop-emulation-card tender-desktop-info-card" style={CARD_STYLE}>
            <EmulationSettings title={title} detail={detail} appId={appId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const GameViewPage = GameView;
