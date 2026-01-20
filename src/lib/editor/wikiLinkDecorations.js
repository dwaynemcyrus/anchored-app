/**
 * CodeMirror 6 extension for wiki-link decorations.
 *
 * Parses [[TARGET]] patterns and applies decorations to style them
 * as clickable links.
 */

import { RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { parseWikiLinks } from "../wikilinks/parser";

// Decoration for the entire wiki-link
const wikiLinkMark = Decoration.mark({
  class: "cm-wikilink",
  attributes: { "data-wikilink": "true" },
});

// Decoration for the brackets (dimmed)
const bracketMark = Decoration.mark({
  class: "cm-wikilink-bracket",
});

// Decoration for the target text (styled as link)
const targetMark = Decoration.mark({
  class: "cm-wikilink-target",
});

/**
 * Build decorations for all wiki-links in the document.
 */
function buildWikiLinkDecorations(state) {
  const builder = new RangeSetBuilder();
  const text = state.doc.toString();
  const links = parseWikiLinks(text);

  for (const link of links) {
    // Apply mark to entire link [[TARGET]]
    builder.add(link.start, link.end, wikiLinkMark);

    // Opening brackets [[
    builder.add(link.start, link.start + 2, bracketMark);

    // Target text
    if (link.end - link.start > 4) {
      builder.add(link.start + 2, link.end - 2, targetMark);
    }

    // Closing brackets ]]
    builder.add(link.end - 2, link.end, bracketMark);
  }

  return builder.finish();
}

/**
 * StateField that tracks wiki-link decorations.
 */
const wikiLinkField = StateField.define({
  create(state) {
    return buildWikiLinkDecorations(state);
  },
  update(decorations, transaction) {
    // Only rebuild if document changed
    if (!transaction.docChanged) return decorations;
    return buildWikiLinkDecorations(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Base theme for wiki-link styling.
 */
const wikiLinkTheme = EditorView.baseTheme({
  ".cm-wikilink": {
    cursor: "pointer",
  },
  ".cm-wikilink-bracket": {
    opacity: "0.4",
    color: "inherit",
  },
  ".cm-wikilink-target": {
    color: "#2563eb",
    textDecoration: "underline",
    textDecorationColor: "rgba(37, 99, 235, 0.3)",
    textUnderlineOffset: "2px",
  },
  "&dark .cm-wikilink-target": {
    color: "#60a5fa",
    textDecorationColor: "rgba(96, 165, 250, 0.3)",
  },
});

/**
 * Create the wiki-link decorations extension.
 *
 * @returns {Array} - CodeMirror extensions for wiki-link styling
 */
export function wikiLinkDecorations() {
  return [wikiLinkField, wikiLinkTheme];
}
