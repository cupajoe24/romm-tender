import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import {
  PlaytimeScopeBanner,
  PlaytimeScopeCard,
  ActiveSessionBanner,
  PLAYTIME_SCOPE_TITLE,
  PLAYTIME_SCOPE_MESSAGE,
  ACTIVE_SESSION_DEFAULT_TITLE,
  ACTIVE_SESSION_DEFAULT_MESSAGE,
} from "./PlaytimeScopeBanner";
import { getPlaytimeScopeNotice } from "../../api/backend";
import { getPlaytimeScopeState, setPlaytimeScopeState } from "../../utils/playtimeScopeStore";
import * as sessionManager from "../../utils/sessionManager";
import * as toast from "../../utils/toast";

vi.mock("../../api/backend", () => ({
  getPlaytimeScopeNotice: vi.fn().mockResolvedValue({ pending: false }),
}));

vi.mock("../../utils/sessionManager", () => ({
  isSessionActive: vi.fn().mockReturnValue(false),
}));

vi.mock("../../utils/toast", () => ({
  showToast: vi.fn(),
}));

const flushAsync = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe("desktop PlaytimeScopeCard", () => {
  beforeEach(() => {
    setPlaytimeScopeState({ pending: false });
    vi.mocked(toast.showToast).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with default title, message, and alert role", () => {
    render(<PlaytimeScopeCard />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("data-testid", "desktop-playtime-scope-banner");
    expect(screen.getByText(PLAYTIME_SCOPE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(PLAYTIME_SCOPE_MESSAGE)).toBeInTheDocument();
  });

  it("renders custom title and message when provided", () => {
    render(<PlaytimeScopeCard title="Custom Title" message="Custom Message" />);

    expect(screen.getByText("Custom Title")).toBeInTheDocument();
    expect(screen.getByText("Custom Message")).toBeInTheDocument();
  });

  it("Open Connections invokes onOpenConnections callback if provided", () => {
    const onOpen = vi.fn();
    render(<PlaytimeScopeCard onOpenConnections={onOpen} />);

    fireEvent.click(screen.getByText("Open Connections"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("Open Connections falls back to showToast if onOpenConnections is not provided", () => {
    render(<PlaytimeScopeCard />);

    fireEvent.click(screen.getByText("Open Connections"));
    expect(toast.showToast).toHaveBeenCalledWith("Open Settings in Big Picture mode to configure RomM connections.");
  });

  it("Dismiss clears the store and triggers onDismiss callback if provided", () => {
    setPlaytimeScopeState({ pending: true });
    const onDismiss = vi.fn();
    render(<PlaytimeScopeCard onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText("Dismiss"));
    expect(getPlaytimeScopeState()).toEqual({ pending: false });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("adapts layout when compact is true", () => {
    const { container: defaultContainer } = render(<PlaytimeScopeCard />);
    const defaultCard = defaultContainer.querySelector(".tender-desktop-playtime-scope-card");
    expect(defaultCard).toHaveStyle({ flexDirection: "row" });

    const { container: compactContainer } = render(<PlaytimeScopeCard compact />);
    const compactCard = compactContainer.querySelector(".tender-desktop-playtime-scope-card");
    expect(compactCard).toHaveStyle({ flexDirection: "column" });
  });
});

describe("desktop ActiveSessionBanner", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with default title, message, and region role", () => {
    render(<ActiveSessionBanner />);

    const region = screen.getByRole("region", { name: "Active Game Session" });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("data-testid", "desktop-active-session-banner");
    expect(screen.getByText(ACTIVE_SESSION_DEFAULT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(ACTIVE_SESSION_DEFAULT_MESSAGE)).toBeInTheDocument();
  });

  it("renders custom title and message when provided", () => {
    render(<ActiveSessionBanner title="Remote Game Running" message="Stream active from Steam Deck." />);

    expect(screen.getByText("Remote Game Running")).toBeInTheDocument();
    expect(screen.getByText("Stream active from Steam Deck.")).toBeInTheDocument();
  });

  it("adapts layout when compact is true", () => {
    const { container: defaultContainer } = render(<ActiveSessionBanner />);
    const defaultCard = defaultContainer.querySelector(".tender-desktop-active-session-card");
    expect(defaultCard).toHaveStyle({ flexDirection: "row" });

    const { container: compactContainer } = render(<ActiveSessionBanner compact />);
    const compactCard = compactContainer.querySelector(".tender-desktop-active-session-card");
    expect(compactCard).toHaveStyle({ flexDirection: "column" });
  });
});

describe("desktop PlaytimeScopeBanner (combined)", () => {
  beforeEach(() => {
    vi.mocked(getPlaytimeScopeNotice).mockReset();
    vi.mocked(getPlaytimeScopeNotice).mockResolvedValue({ pending: false });
    vi.mocked(sessionManager.isSessionActive).mockReset();
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    setPlaytimeScopeState({ pending: false });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders null when neither playtime scope is pending nor session is active", async () => {
    const { container } = render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();
    expect(container.firstChild).toBeNull();
  });

  it("renders PlaytimeScopeCard when playtimeScopeState is pending", async () => {
    vi.mocked(getPlaytimeScopeNotice).mockResolvedValue({ pending: true });
    render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();

    expect(screen.getByTestId("desktop-playtime-scope-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-active-session-banner")).not.toBeInTheDocument();
  });

  it("renders ActiveSessionBanner when sessionManager reports isSessionActive true", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(true);
    render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();

    expect(screen.getByTestId("desktop-active-session-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-playtime-scope-banner")).not.toBeInTheDocument();
  });

  it("renders both banners when both conditions are active", async () => {
    vi.mocked(getPlaytimeScopeNotice).mockResolvedValue({ pending: true });
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(true);
    render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();

    expect(screen.getByTestId("desktop-scope-banners-container")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-playtime-scope-banner")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-active-session-banner")).toBeInTheDocument();
  });

  it("dynamically shows and hides ActiveSessionBanner via romm_session_changed event", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();

    expect(screen.queryByTestId("desktop-active-session-banner")).not.toBeInTheDocument();

    // Session starts for romId 42
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(true);
    await act(async () => {
      globalThis.dispatchEvent(
        new CustomEvent("romm_session_changed", {
          detail: { running: true, appId: 100, romId: 42 },
        }),
      );
      await flushAsync();
    });

    expect(screen.getByTestId("desktop-active-session-banner")).toBeInTheDocument();

    // Session ends for romId 42
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    await act(async () => {
      globalThis.dispatchEvent(
        new CustomEvent("romm_session_changed", {
          detail: { running: false, appId: 100, romId: 42 },
        }),
      );
      await flushAsync();
    });

    expect(screen.queryByTestId("desktop-active-session-banner")).not.toBeInTheDocument();
  });

  it("ignores romm_session_changed events for different romIds", async () => {
    vi.mocked(sessionManager.isSessionActive).mockReturnValue(false);
    render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();

    await act(async () => {
      globalThis.dispatchEvent(
        new CustomEvent("romm_session_changed", {
          detail: { running: true, appId: 999, romId: 999 },
        }),
      );
      await flushAsync();
    });

    expect(screen.queryByTestId("desktop-active-session-banner")).not.toBeInTheDocument();
  });

  it("removes event listener cleanly on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(globalThis, "removeEventListener");
    const { unmount } = render(<PlaytimeScopeBanner appId={100} romId={42} />);
    await flushAsync();

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("romm_session_changed", expect.any(Function));
  });
});
