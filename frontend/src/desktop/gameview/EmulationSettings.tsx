import type { FC } from "react";
import type { GameDetailState } from "../../utils/gameDetailStore";

export interface EmulationSettingsProps {
  title: string;
  detail: GameDetailState;
}

export const EmulationSettings: FC<EmulationSettingsProps> = ({ title, detail }) => {
  const activeCore = detail.activeCoreLabel || detail.platformCoreLabel || "Default";
  const platform = detail.platformSlug ? detail.platformSlug.toUpperCase() : "Platform";
  const biosText = detail.biosNeeded ? detail.biosLabel || "Required" : "No BIOS required";
  const saveLocation = detail.savefilesInContentDir
    ? "Saved next to ROM (savefiles_in_content_dir)"
    : detail.saveSyncEnabled
      ? "Cloud save sync enabled"
      : "Standard emulator save directory";

  return (
    <div
      className="tender-desktop-emulation-settings"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        color: "#c7d5e0",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#8f98a0",
            marginBottom: "4px",
          }}
        >
          {platform} EMULATION
        </div>
        <h2
          style={{
            margin: "0 0 8px 0",
            fontSize: "22px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "0",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "#a0b0c0",
          }}
        >
          Current runner, core mappings, and emulator launch configuration for this title.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "12px 24px",
          fontSize: "13px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingTop: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "12px" }}>
          <span style={{ color: "#6e7f91", minWidth: "110px" }}>Active Core</span>
          <span style={{ color: "#dfe3e6", fontWeight: 500 }}>
            {activeCore}
            {detail.hasGameOverride && (
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "11px",
                  padding: "1px 6px",
                  borderRadius: "2px",
                  backgroundColor: "rgba(59, 130, 246, 0.2)",
                  color: "#60a5fa",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                }}
              >
                Override
              </span>
            )}
          </span>
        </div>

        {detail.platformCoreLabel && (
          <div style={{ display: "flex", gap: "12px" }}>
            <span style={{ color: "#6e7f91", minWidth: "110px" }}>Platform Default</span>
            <span style={{ color: "#dfe3e6" }}>{detail.platformCoreLabel}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
          <span style={{ color: "#6e7f91", minWidth: "110px" }}>Configuration</span>
          <span style={{ color: "#dfe3e6" }}>
            {detail.hasGameOverride ? "Custom game override" : "Inherited from platform"}
          </span>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <span style={{ color: "#6e7f91", minWidth: "110px" }}>Firmware / BIOS</span>
          <span style={{ color: detail.biosRequiredMissing ? "#f87171" : "#dfe3e6" }}>{biosText}</span>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <span style={{ color: "#6e7f91", minWidth: "110px" }}>Save Location</span>
          <span style={{ color: "#dfe3e6" }}>{saveLocation}</span>
        </div>

        {detail.emulators.length > 0 && (
          <div style={{ display: "flex", gap: "12px", gridColumn: "1 / -1", alignItems: "center" }}>
            <span style={{ color: "#6e7f91", minWidth: "110px" }}>Available Cores</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {detail.emulators.map((emu) => (
                <span
                  key={emu.label}
                  style={{
                    padding: "2px 8px",
                    borderRadius: "3px",
                    backgroundColor:
                      emu.label === activeCore ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.06)",
                    color: emu.label === activeCore ? "#ffffff" : "#dfe3e6",
                    fontSize: "12px",
                    border: emu.label === activeCore ? "1px solid rgba(255, 255, 255, 0.2)" : "none",
                  }}
                >
                  {emu.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
