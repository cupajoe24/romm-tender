import type { FC } from "react";

export interface AboutHeaderProps {
  className?: string;
}

export const AboutHeader: FC<AboutHeaderProps> = ({ className }) => {
  return (
    <div
      className={className ? `tender-desktop-about-header ${className}` : "tender-desktop-about-header"}
      style={{
        display: "block",
        padding: "4px 0",
        color: "#8f98a0",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        userSelect: "none",
        marginBottom: "12px",
      }}
    >
      About
    </div>
  );
};
