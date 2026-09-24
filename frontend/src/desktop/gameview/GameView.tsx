import { useState, useEffect, type FC } from "react";
import { useGameDetail } from "../../utils/gameDetailStore";
import { useRomMetadata } from "../../utils/useRomMetadata";
import { coverCandidates } from "../desktopWindow";
import { applyArtwork, cancelArtworkApply } from "../../utils/artwork";
import { debugLog } from "../../api/backend";
import { detach } from "../../utils/detach";
import { registerConnectionHeartbeat } from "../../utils/connectionHeartbeat";
import { resolveAppTitle } from "../../utils/steamOverview";
import { GameViewTabBar, type GameViewTab } from "./GameViewTabBar";
import { AboutDetails } from "./AboutDetails";
import { AchievementsCard } from "./AchievementsCard";
import { EmulationSettings } from "./EmulationSettings";
import { SaveManagementCard } from "./SaveManagementCard";
import { PlayButton } from "./PlayButton";

export interface GameViewProps {
  appId: number;
  showPlayButton?: boolean;
}

export type GameViewPageProps = GameViewProps;

const artworkApplied = new Map<number, number>();

import { CARD_STYLE } from "./styles";

export const GameView: FC<GameViewProps> = ({ appId, showPlayButton }) => {
  const detail = useGameDetail(appId);
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

  useEffect(() => {
    return () => {
      detach(cancelArtworkApply(appId));
    };
  }, [appId]);

  useEffect(() => registerConnectionHeartbeat(), []);

  useEffect(() => {
    const romId = detail.romId;
    if (!romId || artworkApplied.get(appId) === romId) return;
    applyArtwork(romId, appId)
      .then(() => {
        artworkApplied.set(appId, romId);
      })
      .catch((e) => debugLog(`Desktop auto-artwork error: ${e}`));
  }, [appId, detail.romId]);

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
              <EmulationSettings title={title} detail={detail} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const GameViewPage = GameView;
export { PlayButton } from "./PlayButton";
export { DiscSelector } from "./DiscSelector";
export { AchievementsCard } from "./AchievementsCard";
export { AchievementsModal } from "./AchievementsModal";
