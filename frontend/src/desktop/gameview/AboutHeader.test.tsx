import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AboutHeader } from "./AboutHeader";

describe("AboutHeader", () => {
  it("renders the ABOUT section header text", () => {
    render(<AboutHeader />);
    const header = screen.getByText("About");
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass("tender-desktop-about-header");
  });

  it("appends custom className when provided", () => {
    render(<AboutHeader className="custom-test-cls" />);
    const header = screen.getByText("About");
    expect(header).toHaveClass("tender-desktop-about-header");
    expect(header).toHaveClass("custom-test-cls");
  });
});
