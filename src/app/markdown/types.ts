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

export type MarkdownSettings = {
  autoLinkUrls: boolean;
  emoji: boolean;
  mermaid: boolean;
  smartTypography: boolean;
  syntaxHighlighting: boolean;
};

export const DEFAULT_MARKDOWN_SETTINGS: MarkdownSettings = {
  autoLinkUrls: true,
  emoji: true,
  mermaid: true,
  smartTypography: true,
  syntaxHighlighting: true,
};

export type MarkdownRenderResult = {
  body: string;
  frontMatter?: string;
  html: string;
};
