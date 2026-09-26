import { useState, type CSSProperties, type FC } from "react";
import type { RomMetadata } from "../../types";
import { formatReleaseDate } from "../../utils/formatters";

export interface AboutDetailsProps {
  title: string;
  platformName?: string | undefined;
  metadata: RomMetadata | null;
  covers?: string[] | undefined;
}

const CONTAINER_STYLE: CSSProperties = {
  display: "flex",
  gap: "24px",
  color: "#c7d5e0",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const COVER_CONTAINER_STYLE: CSSProperties = {
  width: "160px",
  minWidth: "160px",
  height: "240px",
  borderRadius: "4px",
  overflow: "hidden",
  backgroundColor: "rgba(0, 0, 0, 0.4)",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const COVER_IMAGE_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const COVER_PLACEHOLDER_STYLE: CSSProperties = {
  padding: "12px",
  textAlign: "center",
  fontSize: "12px",
  color: "#6b7a8a",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const INFO_CONTAINER_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const TITLE_STYLE: CSSProperties = {
  margin: "0 0 12px 0",
  fontSize: "24px",
  fontWeight: 700,
  color: "#ffffff",
  letterSpacing: "-0.01em",
};

const SUMMARY_STYLE: CSSProperties = {
  margin: "0 0 20px 0",
  fontSize: "14px",
  lineHeight: 1.6,
  color: "#a0b0c0",
  maxWidth: "800px",
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "10px 24px",
  fontSize: "13px",
  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  paddingTop: "16px",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: "12px",
};

const LABEL_STYLE: CSSProperties = {
  color: "#6e7f91",
  minWidth: "90px",
};

const VALUE_STYLE: CSSProperties = {
  color: "#dfe3e6",
};

const GENRE_ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
};

const GENRE_TAGS_CONTAINER_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const GENRE_TAG_STYLE: CSSProperties = {
  padding: "2px 8px",
  borderRadius: "3px",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: "#dfe3e6",
  fontSize: "12px",
};

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
    <div className="tender-desktop-about-details" style={CONTAINER_STYLE}>
      {/* Cover Image */}
      <div className="tender-desktop-cover-container" style={COVER_CONTAINER_STYLE}>
        {currentCover ? (
          <img
            src={currentCover}
            alt={title}
            onError={() => setCoverIndex((idx) => idx + 1)}
            style={COVER_IMAGE_STYLE}
          />
        ) : (
          <div style={COVER_PLACEHOLDER_STYLE}>{platformName || "RomM Game"}</div>
        )}
      </div>

      {/* Details & Metadata */}
      <div className="tender-desktop-info-container" style={INFO_CONTAINER_STYLE}>
        <h2 style={TITLE_STYLE}>{title}</h2>

        {metadata?.summary && <p style={SUMMARY_STYLE}>{metadata.summary}</p>}

        {/* Metadata Grid */}
        <div style={GRID_STYLE}>
          {platformName && (
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>Platform</span>
              <span style={VALUE_STYLE}>{platformName}</span>
            </div>
          )}

          {developer && (
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>Developer</span>
              <span style={VALUE_STYLE}>{developer}</span>
            </div>
          )}

          {releaseDate && (
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>Release Date</span>
              <span style={VALUE_STYLE}>{releaseDate}</span>
            </div>
          )}

          {gameModes && (
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>Game Modes</span>
              <span style={VALUE_STYLE}>{gameModes}</span>
            </div>
          )}

          {rating && (
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>Rating</span>
              <span style={VALUE_STYLE}>{rating}</span>
            </div>
          )}

          {playerCount && (
            <div style={ROW_STYLE}>
              <span style={LABEL_STYLE}>Players</span>
              <span style={VALUE_STYLE}>{playerCount}</span>
            </div>
          )}

          {genres.length > 0 && (
            <div style={GENRE_ROW_STYLE}>
              <span style={LABEL_STYLE}>Genres</span>
              <div style={GENRE_TAGS_CONTAINER_STYLE}>
                {genres.map((genre) => (
                  <span key={genre} style={GENRE_TAG_STYLE}>
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
