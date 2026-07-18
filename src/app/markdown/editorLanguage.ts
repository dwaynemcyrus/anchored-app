import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { tags } from "@lezer/highlight";

export const anchoredMarkdownLanguage = yamlFrontmatter({
  content: markdown({ base: markdownLanguage }),
});

export const anchoredMarkdownHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "#8d8d8d" },
  { tag: tags.heading, color: "#f1f1f1", fontWeight: "650" },
  { tag: tags.emphasis, color: "#dedede", fontStyle: "italic" },
  { tag: tags.strong, color: "#ffffff", fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#8db7ff", textDecoration: "underline" },
  { tag: tags.url, color: "#8db7ff" },
  { tag: tags.quote, color: "#c4c4c4" },
  { tag: tags.list, color: "#d7a85b" },
  { tag: tags.contentSeparator, color: "#777777" },
  { tag: tags.processingInstruction, color: "#8d8d8d" },
  { tag: tags.monospace, color: "#d6c29a" },
  { tag: tags.special(tags.content), color: "#d6c29a" },
  { tag: tags.character, color: "#82c7a5" },
  { tag: tags.comment, color: "#777777" },
  { tag: tags.propertyName, color: "#d7a85b" },
  { tag: [tags.literal, tags.string], color: "#b9d69c" },
  { tag: [tags.atom, tags.bool, tags.number], color: "#b59cff" },
  { tag: tags.invalid, color: "#ff8f8f" },
]);

export const anchoredMarkdownSyntaxHighlighting = syntaxHighlighting(
  anchoredMarkdownHighlightStyle,
);
