import type { CSSProperties } from "react";

export const CARD_STYLE: CSSProperties = {
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
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

export const MODAL_CONTAINER_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const BACKDROP_BUTTON_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  border: "none",
  margin: 0,
  padding: 0,
  cursor: "default",
};

export const BUTTON_STYLE: CSSProperties = {
  padding: "5px 12px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "3px",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: "#ffffff",
  cursor: "pointer",
  transition: "all 0.15s ease",
  outline: "none",
  userSelect: "none",
};
