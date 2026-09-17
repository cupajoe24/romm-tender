import { useState, type FC } from "react";

export type GameViewTab = "game-info" | "emulation-settings";

export interface GameViewTabBarProps {
  activeTab: GameViewTab;
  onSelectTab: (tab: GameViewTab) => void;
  className?: string;
}

interface TabButtonProps {
  id: GameViewTab;
  label: string;
  isActive: boolean;
  onClick: (id: GameViewTab) => void;
}

const TabButton: FC<TabButtonProps> = ({ id, label, isActive, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  let bg = "transparent";
  let color = "#8f98a0";

  if (isActive) {
    color = "#ffffff";
    bg = isHovered ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.12)";
  } else if (isHovered) {
    color = "#ffffff";
    bg = "rgba(255, 255, 255, 0.08)";
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onClick(id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`tender-desktop-tab-button ${isActive ? "active" : ""}`}
      style={{
        appearance: "none",
        border: "none",
        outline: "none",
        cursor: "pointer",
        padding: "6px 16px",
        borderRadius: "3px",
        fontSize: "13px",
        fontWeight: isActive ? 600 : 500,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color,
        backgroundColor: bg,
        transition: "background-color 0.15s ease, color 0.15s ease",
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
};

export const GameViewTabBar: FC<GameViewTabBarProps> = ({ activeTab, onSelectTab, className }) => {
  return (
    <div
      role="tablist"
      aria-label="Game navigation tabs"
      className={className ? `tender-desktop-tab-bar ${className}` : "tender-desktop-tab-bar"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 8px",
        backgroundColor: "rgba(0, 0, 0, 0.25)",
        borderRadius: "4px",
        marginBottom: "16px",
        userSelect: "none",
      }}
    >
      <TabButton id="game-info" label="Game Info" isActive={activeTab === "game-info"} onClick={onSelectTab} />
      <TabButton
        id="emulation-settings"
        label="Emulation Settings"
        isActive={activeTab === "emulation-settings"}
        onClick={onSelectTab}
      />
    </div>
  );
};
