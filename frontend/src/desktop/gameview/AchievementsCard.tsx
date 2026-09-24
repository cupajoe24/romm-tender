/**
 * AchievementsCard — achievements overview card for the Desktop game view.
 */

import { useState, useEffect, useRef, useMemo, type FC } from "react";
import { getAchievements, getAchievementProgress, debugLog } from "../../api/backend";
import type { Achievement, AchievementProgress, EarnedAchievement } from "../../types";
import {
  beginServerLoad,
  reportServerReachable,
  settleServerLoad,
  useRommConnectionState,
} from "../../utils/connectionState";
import { detach } from "../../utils/detach";
import { getGameIconUrl } from "../../utils/artwork";
import { AchievementsModal } from "./AchievementsModal";

export interface AchievementsCardProps {
  appId: number;
  romId: number;
  raId: number;
  title: string;
  covers?: string[] | undefined;
}

let pendingOpenModalRomId: number | null = null;

export function requestOpenAchievementsModal(romId: number): void {
  pendingOpenModalRomId = romId;
  globalThis.dispatchEvent(new CustomEvent("romm_tab_switch", { detail: { tab: "game-info" } }));
  globalThis.dispatchEvent(new CustomEvent("romm_open_achievements_modal", { detail: { romId } }));
}

export function consumeOpenAchievementsModal(romId: number): boolean {
  if (pendingOpenModalRomId === romId) {
    pendingOpenModalRomId = null;
    return true;
  }
  return false;
}

import { formatCardDate } from "../../utils/formatters";

export { formatCardDate };

import { CARD_STYLE } from "./styles";

export const AchievementsCard: FC<AchievementsCardProps> = ({ appId: _appId, romId, raId, title, covers = [] }) => {
  const isOffline = useRommConnectionState() === "offline";
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [progress, setProgress] = useState<AchievementProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(() => consumeOpenAchievementsModal(romId));
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // Listen for open achievements modal events
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ romId?: number }>;
      if (customEvent.detail.romId === undefined || customEvent.detail.romId === romId) {
        setModalOpen(true);
        consumeOpenAchievementsModal(romId);
      }
    };
    globalThis.addEventListener("romm_open_achievements_modal", handleOpen);
    return () => {
      globalThis.removeEventListener("romm_open_achievements_modal", handleOpen);
    };
  }, [romId]);

  // Fetch achievements data and game icon on mount / when romId changes
  useEffect(() => {
    if (!raId || !romId) return;
    if (loadedRef.current) return;
    if (isOffline) return;

    loadedRef.current = true;
    const load = beginServerLoad();
    let cancelled = false;
    let settled = false;

    async function loadAchievementsData() {
      setLoading(true);
      try {
        const [listResult, progressResult, iconResult] = await Promise.all([
          getAchievements(romId),
          getAchievementProgress(romId),
          getGameIconUrl(romId).catch(() => null),
        ]);
        if (cancelled) return;
        settled = true;

        const unreachable =
          listResult.reason === "server_unreachable" || progressResult.reason === "server_unreachable";
        if (unreachable) {
          reportServerReachable(false);
          loadedRef.current = false;
        } else if ((listResult.success && !listResult.stale) || (progressResult.success && !progressResult.stale)) {
          reportServerReachable(true);
        }

        if (listResult.success) setAchievements(listResult.achievements);
        if (progressResult.success) setProgress(progressResult);
        const resolvedEarned = progressResult.success ? progressResult.earned : 0;
        const resolvedTotal =
          progressResult.success && progressResult.total > 0
            ? progressResult.total
            : listResult.success
              ? listResult.total || listResult.achievements.length
              : 0;
        globalThis.dispatchEvent(
          new CustomEvent("romm_achievements_updated", {
            detail: { romId, earned: resolvedEarned, total: resolvedTotal },
          }),
        );
        if (iconResult) {
          setIconUrl(iconResult);
        } else if (covers.length > 0 && covers[0]) {
          setIconUrl(covers[0]);
        }
        setLoading(false);
      } catch (e) {
        detach(debugLog(`AchievementsCard: failed to load achievements: ${e}`));
        if (!cancelled) {
          settled = true;
          loadedRef.current = false;
          setLoading(false);
        }
      } finally {
        settleServerLoad(load);
      }
    }

    detach(loadAchievementsData());
    return () => {
      cancelled = true;
      if (!settled) {
        loadedRef.current = false;
        setLoading(false);
      }
    };
  }, [romId, raId, isOffline, covers]);

  const earned = progress?.earned ?? 0;
  const total = progress?.total ?? achievements.length;
  const earnedHardcore = progress?.earned_hardcore ?? 0;
  const pct = total > 0 ? (earned / total) * 100 : 0;

  // Build earned map (badge_id -> EarnedAchievement)
  const earnedMap = useMemo(() => {
    const map = new Map<string, EarnedAchievement>();
    for (const ea of progress?.earned_achievements ?? []) {
      map.set(ea.id, ea);
    }
    return map;
  }, [progress?.earned_achievements]);

  // Select top 4 preview items (recent earned first, then locked)
  const previewItems = useMemo(() => {
    const earnedList = achievements.filter((a) => earnedMap.has(a.badge_id));
    const lockedList = achievements.filter((a) => !earnedMap.has(a.badge_id));

    // Sort earned by date desc
    earnedList.sort((a, b) => {
      const aDate = earnedMap.get(a.badge_id)?.date || "";
      const bDate = earnedMap.get(b.badge_id)?.date || "";
      if (aDate && bDate) return bDate.localeCompare(aDate);
      return (a.display_order || 0) - (b.display_order || 0);
    });

    // Sort locked by display order
    lockedList.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    return [...earnedList, ...lockedList].slice(0, 4);
  }, [achievements, earnedMap]);

  if (loading && achievements.length === 0) {
    return (
      <div className="tender-desktop-achievements-card tender-desktop-info-card" style={CARD_STYLE}>
        <div style={{ color: "#8f98a0", fontSize: "13px" }}>Loading achievements…</div>
      </div>
    );
  }

  if (achievements.length === 0) {
    if (isOffline) {
      return (
        <div className="tender-desktop-achievements-card tender-desktop-info-card" style={CARD_STYLE}>
          <div style={{ color: "#8f98a0", fontSize: "13px" }}>RomM offline — achievements unavailable.</div>
        </div>
      );
    }
    return (
      <div className="tender-desktop-achievements-card tender-desktop-info-card" style={CARD_STYLE}>
        <div style={{ color: "#8f98a0", fontSize: "13px" }}>No achievements found for this game.</div>
      </div>
    );
  }

  return (
    <>
      <div className="tender-desktop-achievements-card tender-desktop-info-card" style={CARD_STYLE}>
        {/* Header Row: Title + Progress + Show All */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#8f98a0",
              }}
            >
              Achievements
            </span>
            <span style={{ fontSize: "12px", color: "#8f98a0" }}>
              {`${earned} of ${total}${earnedHardcore > 0 ? ` · ${earnedHardcore} hardcore` : ""}`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              fontSize: "12px",
              fontWeight: 500,
              color: "#66c0f4",
              cursor: "pointer",
              outline: "none",
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#66c0f4";
            }}
          >
            {`Show all ${total}`}
          </button>
        </div>

        {/* Progress Bar (Golden amber matching Image 1) */}
        <div
          style={{
            height: "5px",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            borderRadius: "3px",
            overflow: "hidden",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "linear-gradient(to right, #e5a93c, #f1be48)",
              borderRadius: "3px",
              transition: "width 0.4s ease-out",
            }}
          />
        </div>

        {/* Preview Rows (Up to 4 items) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {previewItems.map((a) => {
            const earnedData = earnedMap.get(a.badge_id);
            const isEarned = Boolean(earnedData);
            const isHardcore = Boolean(earnedData?.date_hardcore);
            const isHovered = hoveredRowId === a.ra_id;

            return (
              <div
                key={`preview-cheevo-${a.ra_id}`}
                onClick={() => setModalOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModalOpen(true);
                  }
                }}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setHoveredRowId(a.ra_id)}
                onMouseLeave={() => setHoveredRowId(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  backgroundColor: isHovered
                    ? "rgba(255, 255, 255, 0.08)"
                    : isEarned
                      ? "rgba(255, 255, 255, 0.03)"
                      : "transparent",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                  cursor: "pointer",
                  transition: "background-color 0.12s ease",
                  userSelect: "none",
                }}
              >
                {/* Badge Image */}
                <img
                  src={isEarned ? a.badge_url : a.badge_url_lock || a.badge_url}
                  alt=""
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "4px",
                    objectFit: "cover",
                    backgroundColor: "rgba(0, 0, 0, 0.4)",
                    flexShrink: 0,
                    filter: isEarned ? "none" : "grayscale(0.85) opacity(0.4)",
                    boxShadow: isHardcore ? "0 0 6px rgba(255, 215, 0, 0.3), 0 0 10px rgba(255, 215, 0, 0.15)" : "none",
                    border: isHardcore ? "1px solid rgba(255, 215, 0, 0.4)" : "none",
                  }}
                />

                {/* Details Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#ffffff",
                      marginBottom: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.title}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#8f98a0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: "2px",
                    }}
                  >
                    {a.description}
                  </div>
                  {a.num_awarded > 0 && (
                    <div style={{ fontSize: "11px", color: "#677584" }}>
                      {`${a.num_awarded.toLocaleString()} players earned this`}
                    </div>
                  )}
                </div>

                {/* Date / Points Column */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "3px",
                    flexShrink: 0,
                  }}
                >
                  {isEarned ? (
                    <>
                      {earnedData?.date && (
                        <span style={{ fontSize: "11px", color: "#8f98a0" }}>{formatCardDate(earnedData.date)}</span>
                      )}
                      {isHardcore && earnedData?.date_hardcore && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
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
                          <span style={{ fontSize: "11px", color: "#8f98a0" }}>
                            {formatCardDate(earnedData.date_hardcore)}
                          </span>
                        </div>
                      )}
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#e5a93c",
                        }}
                      >
                        {`${a.points} pts`}
                      </span>
                    </>
                  ) : (
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "#677584",
                      }}
                    >
                      {`${a.points} pts`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Dialog */}
      <AchievementsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={title}
        iconUrl={iconUrl}
        achievements={achievements}
        progress={progress}
        romId={romId}
      />
    </>
  );
};
