import type { ThemeId } from "../theme/types";

export const ADMONITION_TYPES = [
  "note",
  "abstract",
  "info",
  "tip",
  "success",
  "question",
  "warning",
  "failure",
  "danger",
  "bug",
  "example",
  "quote",
] as const;

export type AdmonitionType = (typeof ADMONITION_TYPES)[number];

export const EDITOR_FONT_SIZES = [12, 14, 16] as const;

export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number];

export const EDITOR_LINE_LENGTHS = [48, 56, 64, 72] as const;

export type EditorLineLength = (typeof EDITOR_LINE_LENGTHS)[number];

export type MarkdownSettings = {
  autoLinkUrls: boolean;
  backslashLineBreaks: boolean;
  editorFontSize: EditorFontSize;
  editorLineLength: EditorLineLength;
  emoji: boolean;
  mermaid: boolean;
  showFileExtensions: boolean;
  smartTypography: boolean;
  syntaxHighlighting: boolean;
  theme: ThemeId;
  updateTypeOnExternalMove: boolean;
};

export const DEFAULT_MARKDOWN_SETTINGS: MarkdownSettings = {
  autoLinkUrls: true,
  backslashLineBreaks: true,
  editorFontSize: 14,
  editorLineLength: 64,
  emoji: true,
  mermaid: true,
  showFileExtensions: false,
  smartTypography: true,
  syntaxHighlighting: true,
  theme: "anchored",
  updateTypeOnExternalMove: true,
};

export type MarkdownRenderResult = {
  body: string;
  frontMatter?: string;
  html: string;
};
