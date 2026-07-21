export const THEME_IDS = [
  "anchored",
  "ayu",
  "dracula",
  "catppuccin",
  "nord",
  "light",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeToken =
  | "color-canvas"
  | "color-text"
  | "color-text-muted"
  | "color-text-subtle"
  | "color-rule"
  | "color-row-hover"
  | "color-row-active"
  | "color-focus"
  | "color-danger"
  | "color-success"
  | "color-menu"
  | "color-menu-border"
  | "color-selection"
  | "color-surface"
  | "color-surface-alt"
  | "color-code-text"
  | "color-mark"
  | "color-backdrop"
  | "syntax-meta"
  | "syntax-heading"
  | "syntax-emphasis"
  | "syntax-strong"
  | "syntax-link"
  | "syntax-quote"
  | "syntax-list"
  | "syntax-rule"
  | "syntax-monospace"
  | "syntax-character"
  | "syntax-comment"
  | "syntax-property"
  | "syntax-string"
  | "syntax-atom"
  | "syntax-invalid";

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  tokens: Record<ThemeToken, string>;
  mermaid: Record<string, string>;
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
