import { useState, useEffect, type FC } from "react";
import { useGameDetail } from "../../utils/gameDetailStore";
import { useRomMetadata } from "../../utils/useRomMetadata";
import { coverCandidates } from "../desktopWindow";
import { useAutoArtwork } from "../../utils/autoArtwork";
import { registerConnectionHeartbeat } from "../../utils/connectionHeartbeat";
import { resolveAppTitle } from "../../utils/steamOverview";
import { useMigrationStatus } from "../../utils/migrationStore";
import { GameViewTabBar, type GameViewTab } from "./GameViewTabBar";
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

export const GameView: FC<GameViewProps> = ({ appId, showPlayButton }) => {
  const detail = useGameDetail(appId);
  const migration = useMigrationStatus();
  const [activeTab, setActiveTab] = useState<GameViewTab>("game-info");

  useEffect(() => {
    const handleTabSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab?: string }>;
      if (customEvent.detail.tab === "emulation-settings") {
        setActiveTab("emulation-settings");
      } else if (customEvent.detail.tab === "game-info") {
        setActiveTab("game-info");
      }
    };
    globalThis.addEventListener("romm_tab_switch", handleTabSwitch);
    return () => {
      globalThis.removeEventListener("romm_tab_switch", handleTabSwitch);
    };
  }, []);

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
      <GameViewTabBar activeTab={activeTab} onSelectTab={setActiveTab} />
      <div className="tender-desktop-tab-container" style={{ marginTop: "12px" }}>
        {activeTab === "game-info" ? (
          <div
            className="tender-desktop-game-info-tab-content"
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
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
        ) : (
          <div
            className="tender-desktop-emulation-tab-content"
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <SaveManagementCard appId={appId} romId={detail.romId} detail={detail} />
            <div className="tender-desktop-emulation-card tender-desktop-info-card" style={CARD_STYLE}>
              <EmulationSettings title={title} detail={detail} appId={appId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const GameViewPage = GameView;
