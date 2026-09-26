import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MigrationBlockedCard,
  MIGRATION_BLOCKED_DEFAULT_TITLE,
  MIGRATION_BLOCKED_DEFAULT_MESSAGE,
} from "./MigrationBlockedCard";

describe("desktop MigrationBlockedCard", () => {
  it("renders with default title, message, and alert role", () => {
    render(<MigrationBlockedCard />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("data-testid", "desktop-migration-blocked-card");
    expect(screen.getByText(MIGRATION_BLOCKED_DEFAULT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(MIGRATION_BLOCKED_DEFAULT_MESSAGE)).toBeInTheDocument();
  });

  it("renders custom title and message when provided", () => {
    render(
      <MigrationBlockedCard
        title="Custom Migration Notice"
        message="Please resolve pending files before continuing."
      />,
    );

    expect(screen.getByText("Custom Migration Notice")).toBeInTheDocument();
    expect(screen.getByText("Please resolve pending files before continuing.")).toBeInTheDocument();
  });

  it("applies desktop styling and adapts layout when compact is true", () => {
    const { container: defaultContainer } = render(<MigrationBlockedCard />);
    const defaultCard = defaultContainer.querySelector(".tender-desktop-migration-card");
    expect(defaultCard).toHaveStyle({ flexDirection: "row" });

    const { container: compactContainer } = render(<MigrationBlockedCard compact />);
    const compactCard = compactContainer.querySelector(".tender-desktop-migration-card");
    expect(compactCard).toHaveStyle({ flexDirection: "column" });
  });

  it("includes the exclamation triangle icon with aria-hidden", () => {
    const { container } = render(<MigrationBlockedCard />);
    const icon = container.querySelector("svg");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
