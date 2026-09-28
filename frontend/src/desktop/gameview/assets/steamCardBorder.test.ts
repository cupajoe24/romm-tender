import { describe, expect, it } from "vitest";
import { STEAM_CARD_BORDER_IMAGE } from "./steamCardBorder";
import { STEAM_CARD_BORDER_IMAGE as STYLES_BORDER_IMAGE, CARD_STYLE } from "../styles";

describe("steamCardBorder asset", () => {
  it("exports a valid 9-slice PNG data URI url", () => {
    expect(STEAM_CARD_BORDER_IMAGE).toMatch(/^url\("data:image\/png;base64,[A-Za-z0-9+/=]+"\)$/);
  });

  it("is re-exported identically from styles.ts and used in CARD_STYLE", () => {
    expect(STYLES_BORDER_IMAGE).toBe(STEAM_CARD_BORDER_IMAGE);
    expect(CARD_STYLE.borderImageSource).toBe(STEAM_CARD_BORDER_IMAGE);
  });
});
