/**
 * AchievementsModal — Steam-styled modal dialog displaying full achievement list
 * for a game in Desktop mode.
 *
 * Stylistically mirrors Steam's native achievements window:
 * - Centered dark glassmorphic dialog with backdrop blur and escape/backdrop dismiss.
 * - Header with game cover thumbnail, title, and circular close button.
 * - Upper progress bar with "X OF Y ACHIEVEMENTS EARNED (Z%)" and cyan/blue progress fill.
 * - Live search filtering by title and description.
 * - Achievement cards with badge, title, description, player unlock stats, points,
 *   unlock timestamp, and the blue unlock indicator bar.
 */

import { useState, useEffect, useMemo, useCallback, type FC } from "react";
import type { Achievement, AchievementProgress, EarnedAchievement } from "../../types";
import { getGameIconUrl } from "../../utils/artwork";

export interface AchievementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  iconUrl?: string | null | undefined;
  coverUrl?: string | null | undefined;
  achievements: Achievement[];
  progress: AchievementProgress | null;
  romId?: number | undefined;
}

/** "2025-02-14 15:45:38" -> formatted localized string (e.g. "Feb 14, 2025, 3:45 PM") */
export function formatModalUnlockDate(dateStr: string): string {
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const d = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  } catch {
    // fallback to compact string if parsing fails
  }
  return dateStr.replace(/:\d{2}$/, "");
}

const MODAL_CONTAINER_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const BACKDROP_BUTTON_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "none",
  margin: 0,
  padding: 0,
  cursor: "default",
};

const DIALOG_BOX_STYLE: React.CSSProperties = {
  width: "720px",
  maxWidth: "92vw",
  maxHeight: "88vh",
  background: "linear-gradient(180deg, #243547 0%, #17212b 40%, #0e141b 100%)",
  backgroundColor: "#161e27",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: "6px",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  zIndex: 1,
  color: "#c7d5e0",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  overflow: "hidden",
};

export const AchievementsModal: FC<AchievementsModalProps> = ({
  isOpen,
  onClose,
  title,
  iconUrl,
  coverUrl,
  achievements,
  progress,
  romId,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selfLoadedIcon, setSelfLoadedIcon] = useState<string | null>(null);

  useEffect(() => {
    if (iconUrl || coverUrl || !romId || !isOpen) return;
    let cancelled = false;

    void getGameIconUrl(romId).then((url) => {
      if (!cancelled && url) {
        setSelfLoadedIcon(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [iconUrl, coverUrl, romId, isOpen]);

  const displayIcon = iconUrl ?? coverUrl ?? selfLoadedIcon;

  const handleClose = useCallback(() => {
    setSearchQuery("");
    onClose();
  }, [onClose]);

  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const earned = progress?.earned ?? 0;
  const total = progress?.total ?? achievements.length;
  const pct = total > 0 ? (earned / total) * 100 : 0;

  // Build earned map
  const earnedMap = useMemo(() => {
    const map = new Map<string, EarnedAchievement>();
    for (const ea of progress?.earned_achievements ?? []) {
      map.set(ea.id, ea);
    }
    return map;
  }, [progress?.earned_achievements]);

  // Sort and filter achievements
  const displayAchievements = useMemo(() => {
    let list = [...achievements];

    // Filter by search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }

    // Earned first (sorted by date earned desc if available), then locked by display_order
    list.sort((a, b) => {
      const aEarned = earnedMap.has(a.badge_id) ? 0 : 1;
      const bEarned = earnedMap.has(b.badge_id) ? 0 : 1;
      if (aEarned !== bEarned) return aEarned - bEarned;
      if (aEarned === 0) {
        const aDate = earnedMap.get(a.badge_id)?.date || "";
        const bDate = earnedMap.get(b.badge_id)?.date || "";
        if (aDate && bDate) return bDate.localeCompare(aDate);
      }
      return (a.display_order || 0) - (b.display_order || 0);
    });

    return list;
  }, [achievements, earnedMap, searchQuery]);

  if (!isOpen) return null;

  return (
    <div style={MODAL_CONTAINER_STYLE}>
      <button
        type="button"
        aria-label="Close achievements dialog"
        style={BACKDROP_BUTTON_STYLE}
        onClick={handleClose}
      />

      <div role="dialog" aria-modal="true" aria-labelledby="achievements-modal-title" style={DIALOG_BOX_STYLE}>
        {/* Header Bar */}
        <div
          style={{
            padding: "20px 24px 16px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Top Row: Cover, Title, Close Button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
              {displayIcon ? (
                <img
                  src={displayIcon}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "4px",
                    objectFit: "cover",
                    backgroundColor: "rgba(0,0,0,0.3)",
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <h2
                id="achievements-modal-title"
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "#ffffff",
                  letterSpacing: "-0.01em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </h2>
            </div>

            <button
              type="button"
              aria-label="Close"
              onClick={handleClose}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#c7d5e0",
                fontSize: "14px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
                outline: "none",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.18)";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.color = "#c7d5e0";
              }}
            >
              ✕
            </button>
          </div>

          {/* Progress Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#8f98a0",
              marginBottom: "6px",
            }}
          >
            <span>{`${earned} OF ${total} ACHIEVEMENTS EARNED`}</span>
            <span>{`(${Math.round(pct)}%)`}</span>
          </div>

          {/* Cyan/Blue Progress Bar */}
          <div
            style={{
              height: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                backgroundColor: "#00a2ff",
                boxShadow: "0 0 8px rgba(0, 162, 255, 0.4)",
                borderRadius: "3px",
                transition: "width 0.4s ease-out",
              }}
            />
          </div>

          {/* Filter Bar with Search Input */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "220px",
                padding: "6px 12px",
                fontSize: "12px",
                backgroundColor: "rgba(0, 0, 0, 0.35)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "4px",
                color: "#ffffff",
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(102, 192, 244, 0.6)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              }}
            />
            <span style={{ fontSize: "12px", color: "#677584" }}>
              {searchQuery.trim() ? `${displayAchievements.length} matching` : `${displayAchievements.length} total`}
            </span>
          </div>
        </div>

        {/* Scrollable Achievements List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {displayAchievements.length === 0 ? (
            <div
              style={{
                padding: "36px 0",
                textAlign: "center",
                color: "#677584",
                fontSize: "13px",
              }}
            >
              {searchQuery ? "No achievements match your search." : "No achievements available."}
            </div>
          ) : (
            displayAchievements.map((a) => {
              const earnedData = earnedMap.get(a.badge_id);
              const isEarned = Boolean(earnedData);
              const isHardcore = Boolean(earnedData?.date_hardcore);

              return (
                <div
                  key={`modal-cheevo-${a.ra_id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px 16px",
                    borderRadius: "4px",
                    backgroundColor: isEarned ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.2)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  {/* Badge Icon */}
                  <img
                    src={isEarned ? a.badge_url : a.badge_url_lock || a.badge_url}
                    alt=""
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "4px",
                      objectFit: "cover",
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      flexShrink: 0,
                      filter: isEarned ? "none" : "grayscale(0.85) opacity(0.4)",
                      boxShadow: isHardcore
                        ? "0 0 6px rgba(255, 215, 0, 0.4), 0 0 12px rgba(255, 215, 0, 0.2)"
                        : "none",
                      border: isHardcore ? "1px solid rgba(255, 215, 0, 0.4)" : "none",
                    }}
                  />

                  {/* Middle: Title, Description, Stats */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#ffffff",
                        marginBottom: "3px",
                      }}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#8f98a0",
                        lineHeight: 1.4,
                        marginBottom: "4px",
                      }}
                    >
                      {a.description}
                    </div>
                    {a.num_awarded > 0 && (
                      <div style={{ fontSize: "11px", color: "#677584" }}>
                        {`${a.num_awarded.toLocaleString()} players have this achievement`}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Unlock date, points, blue indicator bar */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      minWidth: "150px",
                      flexShrink: 0,
                    }}
                  >
                    {isEarned ? (
                      <>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#8f98a0",
                            marginBottom: "2px",
                            textAlign: "right",
                          }}
                        >
                          {earnedData?.date ? `Unlocked ${formatModalUnlockDate(earnedData.date)}` : "Unlocked"}
                        </div>
                        {isHardcore && earnedData?.date_hardcore && (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              marginBottom: "2px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "9px",
                                fontWeight: 700,
                                color: "#ffd700",
                                backgroundColor: "rgba(255, 215, 0, 0.15)",
                                padding: "1px 4px",
                                borderRadius: "2px",
                              }}
                            >
                              HC
                            </span>
                            <span style={{ fontSize: "10px", color: "#8f98a0" }}>
                              {formatModalUnlockDate(earnedData.date_hardcore)}
                            </span>
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#e5a93c",
                            marginBottom: "4px",
                          }}
                        >
                          {`${a.points} pts`}
                        </div>
                        {/* Blue status bar indicator matching Steam's modal */}
                        <div
                          style={{
                            width: "100%",
                            height: "3px",
                            backgroundColor: "#00a2ff",
                            borderRadius: "2px",
                            boxShadow: "0 0 6px rgba(0, 162, 255, 0.5)",
                          }}
                        />
                      </>
                    ) : (
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#677584",
                        }}
                      >
                        {`${a.points} pts`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
