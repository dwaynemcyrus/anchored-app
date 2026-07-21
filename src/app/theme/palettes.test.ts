import { describe, expect, it } from "vitest";

import { THEME_DEFINITIONS, THEME_OPTIONS } from "./palettes";
import { THEME_IDS } from "./types";

describe("theme palettes", () => {
  it("defines an option and palette for every supported theme", () => {
    expect(THEME_OPTIONS.map((theme) => theme.id)).toEqual(THEME_IDS);

    THEME_IDS.forEach((themeId) => {
      const theme = THEME_DEFINITIONS[themeId];
      expect(theme.label).toBeTruthy();
      expect(theme.tokens["color-canvas"]).toMatch(/^#/);
      expect(theme.tokens["syntax-link"]).toMatch(/^#/);
      expect(theme.mermaid.primaryTextColor).toBeTruthy();
    });
  });
});
