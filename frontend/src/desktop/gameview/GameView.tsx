import { useState, useEffect, type FC } from "react";
import { useGameDetail } from "../../utils/gameDetailStore";
import { getRomMetadataShared } from "../../api/sharedReads";
import type { RomMetadata } from "../../types";
import { coverCandidates } from "../desktopWindow";
import { AboutHeader } from "./AboutHeader";
import { AboutDetails } from "./AboutDetails";

export interface GameViewProps {
  appId: number;
}

export type GameViewPageProps = GameViewProps;

interface SteamOverview {
  display_name?: string;
}

interface AppStoreStub {
  GetAppOverviewByAppID?: (id: number) => SteamOverview | undefined;
}

export const GameView: FC<GameViewProps> = ({ appId }) => {
  const detail = useGameDetail(appId);
  const [loadedMetadata, setLoadedMetadata] = useState<RomMetadata | null>(null);

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
      <AboutHeader />
      <div
        className="tender-desktop-about-card"
        style={{
          padding: "24px",
          backgroundColor: "#16202d",
          borderRadius: "8px",
          color: "#c7d5e0",
        }}
      >
        <AboutDetails
          title={title}
          platformName={detail.platformSlug || undefined}
          metadata={metadata}
          covers={covers}
        />
      </div>
    </div>
  );
};

export const GameViewPage = GameView;
