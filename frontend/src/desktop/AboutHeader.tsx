import type { FC } from "react";

export interface AboutHeaderProps {
  className?: string;
}

export const AboutHeader: FC<AboutHeaderProps> = ({ className }) => {
  return (
    <div
      className={className ? `tender-desktop-about-header ${className}` : "tender-desktop-about-header"}
      style={{
        display: "inline-block",
        padding: "6px 16px",
        backgroundColor: "rgba(35, 46, 59, 0.85)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "4px",
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect: "none",
        marginBottom: "16px",
      }}
    >
      About
    </div>
  );
};
