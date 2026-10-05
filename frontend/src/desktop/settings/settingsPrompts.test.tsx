import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { useEffect } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { SettingsPrompts } from "../../utils/useSettingsPage";
import { useDialogHost } from "../gameview/dialogs/useDialogHost";
import { desktopSettingsPrompts } from "./settingsPrompts";

const held: { prompts?: SettingsPrompts } = {};

function Host() {
  const dialogs = useDialogHost();
  useEffect(() => {
    held.prompts = desktopSettingsPrompts(dialogs.ask);
  }, [dialogs.ask]);
  return <>{dialogs.element}</>;
}

const prompts = (): SettingsPrompts => held.prompts as SettingsPrompts;

async function answer(ask: () => Promise<boolean>, title: string, choice: string) {
  let answered!: Promise<boolean>;
  act(() => {
    answered = ask();
  });
  const box = screen.getByRole("dialog", { name: title });
  fireEvent.click(within(box).getByRole("button", { name: choice }));
  return { box, answer: await answered };
}

describe("desktopSettingsPrompts", () => {
  it("asks before turning save sync on, in the shared words", async () => {
    render(<Host />);
    const { box, answer: yes } = await answer(
      () => prompts().confirmEnableSaveSync(),
      "Enable Save Sync?",
      "I am sure",
    );
    expect(yes).toBe(true);
    expect(box).toHaveTextContent("Are you sure you want to proceed?");

    const { answer: no } = await answer(() => prompts().confirmEnableSaveSync(), "Enable Save Sync?", "Cancel");
    expect(no).toBe(false);
  });

  it("names both regions and draws the question's bold words bold", async () => {
    render(<Host />);
    let answered!: Promise<boolean>;
    act(() => {
      answered = prompts().confirmPreferredRegion("USA", "Japan");
    });
    const box = screen.getByRole("dialog", { name: "Change Preferred Region" });
    expect(box).toHaveTextContent("USA → Japan");
    expect(Array.from(box.querySelectorAll("strong"), (el) => el.textContent)).toEqual([
      "from now on",
      "already synced keep their current version and shortcut name",
    ]);
    fireEvent.click(within(box).getByRole("button", { name: "Save" }));
    expect(await answered).toBe(true);
  });
});
