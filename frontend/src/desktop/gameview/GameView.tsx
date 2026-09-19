import { useState, useEffect, type FC } from "react";
import { useGameDetail } from "../../utils/gameDetailStore";
import { getRomMetadataShared } from "../../api/sharedReads";
import type { RomMetadata } from "../../types";
import { coverCandidates } from "../desktopWindow";
import { applyArtwork, cancelArtworkApply } from "../../utils/artwork";
import { debugLog } from "../../api/backend";
import { detach } from "../../utils/detach";
import { registerConnectionHeartbeat } from "../../utils/connectionHeartbeat";
import { GameViewTabBar, type GameViewTab } from "./GameViewTabBar";
import { AboutDetails } from "./AboutDetails";
import { EmulationSettings } from "./EmulationSettings";
import { PlayButton } from "./PlayButton";

export interface GameViewProps {
  appId: number;
  showPlayButton?: boolean;
}

export type GameViewPageProps = GameViewProps;

interface SteamOverview {
  display_name?: string;
}

interface AppStoreStub {
  GetAppOverviewByAppID?: (id: number) => SteamOverview | undefined;
}

const artworkApplied = new Map<number, number>();

export const GameView: FC<GameViewProps> = ({ appId, showPlayButton }) => {
  const detail = useGameDetail(appId);
  const [activeTab, setActiveTab] = useState<GameViewTab>("game-info");
  const [loadedMetadata, setLoadedMetadata] = useState<RomMetadata | null>(null);

  useEffect(() => {
    const handleTabSwitch = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab?: string }>;
      if (customEvent.detail?.tab === "emulation-settings") {
        setActiveTab("emulation-settings");
      } else if (customEvent.detail?.tab === "game-info") {
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

  useEffect(() => {
    const romId = detail.romId;
    if (!romId) return;

    let cancelled = false;
    void getRomMetadataShared(romId)
      .then((meta) => {
        if (!cancelled) {
          setLoadedMetadata(meta);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedMetadata(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detail.romId]);

  const metadata = detail.romId ? loadedMetadata : null;

  const store = (window as unknown as { appStore?: AppStoreStub }).appStore;
  const overview = store?.GetAppOverviewByAppID?.(appId);
  const title = overview?.display_name || detail.romName || `App ${appId}`;
  const covers = coverCandidates(appId);

  return (
    <div
      className="tender-desktop-game-view"
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
      <div
        className="tender-desktop-about-card tender-desktop-info-card"
        style={{
          padding: "24px",
          background:
            "linear-gradient(180deg, rgba(45, 66, 92, 0.85) 0%, rgba(24, 35, 49, 0.8) 40%, rgba(13, 19, 27, 0.9) 100%)",
          backgroundColor: "rgba(13, 19, 27, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.09)",
          borderTop: "1px solid rgba(255, 255, 255, 0.16)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.5)",
          borderRadius: "4px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          color: "#c7d5e0",
        }}
      >
        {activeTab === "game-info" ? (
          <AboutDetails
            title={title}
            platformName={detail.platformSlug || undefined}
            metadata={metadata}
            covers={covers}
          />
        ) : (
          <EmulationSettings title={title} detail={detail} />
        )}
      </div>
    </div>
  );
};

export const GameViewPage = GameView;
export { PlayButton } from "./PlayButton";
