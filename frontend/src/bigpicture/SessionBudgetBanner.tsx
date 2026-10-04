import { FC, ReactNode } from "react";
import { PanelSectionRow, ButtonItem, Focusable } from "@decky/ui";
import { isAnyAppRunning } from "../utils/runningApps";
import {
  RESTART_BLOCKED_BY_GAME,
  RESTART_STEAM_LABEL,
  memoryLevel,
  sessionBudgetCard,
  type MemoryLevel,
  type SessionBudgetCard,
  type SessionBudgetCardInput,
} from "../utils/sessionBudget";
import { restartSteam } from "../utils/steamRestart";

/** The QAM's traffic light for a memory level; the hexes match the panel's status palette. */
const MEMORY_LEVEL_COLOR: Record<MemoryLevel, string> = {
  full: "#d4343c",
  high: "#d4a72c",
  fine: "#59bf40",
};

/** Traffic-light colour for a live memory reading, by {@link memoryLevel}. */
export function memoryLevelColor(rssKb: number, warnKb: number, ceilingKb: number): string {
  return MEMORY_LEVEL_COLOR[memoryLevel(rssKb, warnKb, ceilingKb)];
}

const CARD_LOOK: Record<SessionBudgetCard["kind"], { accent: string; background: string; testId: string }> = {
  paused: { accent: "#3d9df6", background: "rgba(61, 157, 246, 0.15)", testId: "budget-paused-banner" },
  "high-heap": { accent: "#d4a72c", background: "rgba(212, 167, 44, 0.15)", testId: "budget-high-heap-banner" },
};

function bannerCard(card: SessionBudgetCard): ReactNode {
  const { accent, background, testId } = CARD_LOOK[card.kind];
  return (
    <PanelSectionRow>
      {/* This component is QAM-only. The no-op activation makes the banner a
          focus stop for scrolling; the card div keeps the testId and styling. */}
      <Focusable onActivate={() => {}}>
        <div
          data-testid={testId}
          style={{
            padding: "8px 12px",
            backgroundColor: background,
            borderLeft: `3px solid ${accent}`,
            borderRadius: "4px",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "bold", color: accent, marginBottom: "6px" }}>{card.title}</div>
          <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.85)", lineHeight: 1.5 }}>{card.body}</div>
        </div>
      </Focusable>
    </PanelSectionRow>
  );
}

interface SessionBudgetBannerProps extends SessionBudgetCardInput {
  /**
   * Disables the "Restart Steam now" button for reasons the caller knows about
   * (mid-flight / not connected). The banner ALSO disables it while a game is
   * running — checked here via ``isAnyAppRunning`` — so a restart can never close a
   * running game.
   */
  restartDisabled?: boolean | undefined;
}

/**
 * Persistent QAM banner for the session-budget card, which `utils/sessionBudget.ts`
 * decides and words: blue while the last run is paused, yellow when the live heap
 * is high after a completed run, nothing when neither applies. Both offer
 * **Restart Steam now** — a deterministic full client restart that resets the
 * renderer's per-session heap budget — disabled while a game is running.
 */
export const SessionBudgetBanner: FC<SessionBudgetBannerProps> = ({ restartDisabled, ...input }) => {
  const card = sessionBudgetCard(input);
  if (card === null) return null;

  // A restart would close a running game, so disable (and hard-guard on click) when
  // one is detected.
  const gameRunning = isAnyAppRunning();
  return (
    <>
      {bannerCard(card)}
      {card.offersRestart && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={restartSteam}
            disabled={(restartDisabled ?? false) || gameRunning}
            // Description ONLY for the disabled-by-running-game case, where it explains
            // why the button can't be pressed. The banner body already says what the
            // restart is for, so a description on the enabled button is pure noise.
            description={gameRunning ? RESTART_BLOCKED_BY_GAME : undefined}
          >
            {RESTART_STEAM_LABEL}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </>
  );
};
