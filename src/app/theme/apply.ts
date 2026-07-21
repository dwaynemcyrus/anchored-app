import { THEME_DEFINITIONS } from "./palettes";
import type { ThemeId } from "./types";

export function applyTheme(themeId: ThemeId): void {
  const theme = THEME_DEFINITIONS[themeId] ?? THEME_DEFINITIONS.anchored;
  const root = document.documentElement;

  root.dataset.theme = theme.id;
  Object.entries(theme.tokens).forEach(([token, value]) => {
    root.style.setProperty(`--${token}`, value);
  });
}
