import { useState, type FC } from "react";
import type { RomMetadata } from "../../types";

export interface AboutDetailsProps {
  title: string;
  platformName?: string | undefined;
  metadata: RomMetadata | null;
  covers?: string[] | undefined;
}

export function formatReleaseDate(timestamp: number | null): string | null {
  if (!timestamp || timestamp <= 0) return null;
  const date = new Date(timestamp * 1000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export const AboutDetails: FC<AboutDetailsProps> = ({ title, platformName, metadata, covers = [] }) => {
  const [coverIndex, setCoverIndex] = useState(0);

  const releaseDate = metadata ? formatReleaseDate(metadata.first_release_date) : null;
  const developer = metadata?.companies && metadata.companies.length > 0 ? metadata.companies.join(", ") : null;
  const gameModes = metadata?.game_modes && metadata.game_modes.length > 0 ? metadata.game_modes.join(", ") : null;
  const genres = metadata?.genres && metadata.genres.length > 0 ? metadata.genres : [];
  const rating =
    metadata?.average_rating != null && metadata.average_rating > 0 ? `${Math.round(metadata.average_rating)}%` : null;
  const playerCount = metadata?.player_count || null;

  const currentCover = covers.length > 0 && coverIndex < covers.length ? covers[coverIndex] : null;

  return (
    <div
      className="tender-desktop-about-details"
      style={{
        display: "flex",
        gap: "24px",
        color: "#c7d5e0",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Cover Image */}
      <div
        className="tender-desktop-cover-container"
        style={{
          width: "160px",
          minWidth: "160px",
          height: "240px",
          borderRadius: "6px",
          overflow: "hidden",
          backgroundColor: "#1b2838",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {currentCover ? (
          <img
            src={currentCover}
            alt={title}
            onError={() => setCoverIndex((idx) => idx + 1)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              padding: "12px",
              textAlign: "center",
              fontSize: "12px",
              color: "#6b7a8a",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {platformName || "RomM Game"}
          </div>
        )}
      </div>

      {/* Details & Metadata */}
      <div className="tender-desktop-info-container" style={{ flex: 1, minWidth: 0 }}>
        <h2
          style={{
            margin: "0 0 12px 0",
            fontSize: "24px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>

        {metadata?.summary && (
          <p
            style={{
              margin: "0 0 20px 0",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#a0b0c0",
              maxWidth: "800px",
            }}
          >
            {metadata.summary}
          </p>
        )}

        {/* Metadata Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "10px 24px",
            fontSize: "13px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: "16px",
          }}
        >
          {platformName && (
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Platform</span>
              <span style={{ color: "#dfe3e6" }}>{platformName}</span>
            </div>
          )}

          {developer && (
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Developer</span>
              <span style={{ color: "#dfe3e6" }}>{developer}</span>
            </div>
          )}

          {releaseDate && (
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Release Date</span>
              <span style={{ color: "#dfe3e6" }}>{releaseDate}</span>
            </div>
          )}

          {gameModes && (
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Game Modes</span>
              <span style={{ color: "#dfe3e6" }}>{gameModes}</span>
            </div>
          )}

          {rating && (
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Rating</span>
              <span style={{ color: "#dfe3e6" }}>{rating}</span>
            </div>
          )}

          {playerCount && (
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Players</span>
              <span style={{ color: "#dfe3e6" }}>{playerCount}</span>
            </div>
          )}

          {genres.length > 0 && (
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <span style={{ color: "#6e7f91", minWidth: "90px" }}>Genres</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {genres.map((genre) => (
                  <span
                    key={genre}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "3px",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: "#dfe3e6",
                      fontSize: "12px",
                    }}
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
