import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { tags } from "@lezer/highlight";

export const anchoredMarkdownLanguage = yamlFrontmatter({
  content: markdown({ base: markdownLanguage }),
});

export const anchoredMarkdownHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--syntax-meta)" },
  { tag: tags.heading, color: "var(--syntax-heading)", fontWeight: "650" },
  {
    tag: tags.emphasis,
    color: "var(--syntax-emphasis)",
    fontStyle: "italic",
  },
  { tag: tags.strong, color: "var(--syntax-strong)", fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.link,
    color: "var(--syntax-link)",
    textDecoration: "underline",
  },
  { tag: tags.url, color: "var(--syntax-link)" },
  { tag: tags.quote, color: "var(--syntax-quote)" },
  { tag: tags.list, color: "var(--syntax-list)" },
  { tag: tags.contentSeparator, color: "var(--syntax-rule)" },
  { tag: tags.processingInstruction, color: "var(--syntax-meta)" },
  { tag: tags.monospace, color: "var(--syntax-monospace)" },
  { tag: tags.special(tags.content), color: "var(--syntax-monospace)" },
  { tag: tags.character, color: "var(--syntax-character)" },
  { tag: tags.comment, color: "var(--syntax-comment)" },
  { tag: tags.propertyName, color: "var(--syntax-property)" },
  { tag: [tags.literal, tags.string], color: "var(--syntax-string)" },
  { tag: [tags.atom, tags.bool, tags.number], color: "var(--syntax-atom)" },
  { tag: tags.invalid, color: "var(--syntax-invalid)" },
]);

export const anchoredMarkdownSyntaxHighlighting = syntaxHighlighting(
  anchoredMarkdownHighlightStyle,
);
