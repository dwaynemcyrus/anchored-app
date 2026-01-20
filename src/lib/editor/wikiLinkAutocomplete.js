/**
 * CodeMirror 6 autocomplete extension for wiki-links.
 *
 * Triggers autocomplete when user types [[ and provides
 * document suggestions with search and ranking.
 */

import { autocompletion, completionKeymap, startCompletion } from "@codemirror/autocomplete";
import { EditorView, keymap } from "@codemirror/view";
import { findWikiLinkAtPosition } from "../wikilinks/parser";
import { searchDocsForLink, findExactMatch } from "../wikilinks/linkSearch";

/**
 * Create a wiki-link completion source.
 *
 * @param {Object} options
 * @param {Function} options.getDocs - Async function that returns docs for search
 * @param {Function} options.onCreateDoc - Callback when "Create" option is selected
 * @returns {Function} - CodeMirror completion source
 */
function wikiLinkCompletionSource({ getDocs, onCreateDoc }) {
  let cachedDocs = null;
  let cacheTime = 0;
  const CACHE_TTL = 5000; // 5 seconds

  return async (context) => {
    const { state, pos } = context;
    const text = state.doc.toString();

    // Find wiki-link region at cursor
    const region = findWikiLinkAtPosition(text, pos);

    // Not inside a wiki-link
    if (!region) {
      return null;
    }

    // If closed AND has content, user has finished typing - don't show autocomplete
    // But if closed with empty query (e.g. [[|]] from closeBrackets), still show
    if (region.isClosed && region.query.length > 0) {
      return null;
    }

    const query = region.query;
    const from = region.start + 2; // After [[

    // Get docs (with caching)
    const now = Date.now();
    if (!cachedDocs || now - cacheTime > CACHE_TTL) {
      try {
        cachedDocs = await getDocs();
        cacheTime = now;
      } catch (err) {
        console.error("Failed to load docs for autocomplete:", err);
        cachedDocs = [];
      }
    }

    // Search and rank docs
    const results = searchDocsForLink(cachedDocs || [], query, 8);

    // Build completion options
    const options = results.map((doc) => ({
      label: doc.title || "Untitled",
      detail: doc.slug || formatDate(doc.updatedAt),
      type: "text",
      boost: 1,
      apply: (view, completion, from, to) => {
        applyCompletion(view, doc.title || "Untitled", from, to);
      },
    }));

    // Add "Create" option if query has content and no exact match
    if (query.length > 0) {
      const hasExactMatch = findExactMatch(cachedDocs || [], query);
      if (!hasExactMatch) {
        options.push({
          label: `Create "${query}"`,
          detail: "new note",
          type: "keyword",
          boost: 0,
          apply: (view, completion, from, to) => {
            // Create the doc and insert link
            if (onCreateDoc) {
              onCreateDoc(query).then((doc) => {
                if (doc) {
                  applyCompletion(view, doc.title || query, from, to);
                }
              }).catch((err) => {
                console.error("Failed to create doc:", err);
                applyCompletion(view, query, from, to);
              });
            } else {
              applyCompletion(view, query, from, to);
            }
          },
        });
      }
    }

    // Always return something if we're inside [[ even with no options
    // This ensures the menu shows the "Create" option
    if (options.length === 0 && query.length > 0) {
      options.push({
        label: `Create "${query}"`,
        detail: "new note",
        type: "keyword",
        boost: 0,
        apply: (view, completion, from, to) => {
          if (onCreateDoc) {
            onCreateDoc(query).then((doc) => {
              if (doc) {
                applyCompletion(view, doc.title || query, from, to);
              }
            }).catch((err) => {
              console.error("Failed to create doc:", err);
              applyCompletion(view, query, from, to);
            });
          } else {
            applyCompletion(view, query, from, to);
          }
        },
      });
    }

    if (options.length === 0) {
      return null;
    }

    return {
      from,
      to: pos,
      options,
      filter: false, // We handle filtering ourselves
    };
  };
}

/**
 * Apply a completion by inserting the title and closing brackets.
 */
function applyCompletion(view, title, from, to) {
  const text = view.state.doc.toString();
  const afterCursor = text.slice(to);

  // Check if ]] already exists right after cursor
  const hasClosing = afterCursor.startsWith("]]");

  const insertText = hasClosing ? title : title + "]]";
  // Always position cursor after the closing ]]
  const cursorPos = from + title.length + 2;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: cursorPos },
  });
}

/**
 * Format a timestamp for display.
 */
function formatDate(timestamp) {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Extension that triggers autocomplete when [[ is typed or when
 * typing continues inside an unclosed wiki-link.
 */
function wikiLinkTrigger() {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    const { state } = update;
    const pos = state.selection.main.head;
    const text = state.doc.toString();

    // Check if we just typed [[ (cursor is right after it)
    if (pos >= 2 && text.slice(pos - 2, pos) === "[[") {
      // Trigger autocomplete after a small delay to let the state settle
      setTimeout(() => {
        startCompletion(update.view);
      }, 0);
      return;
    }

    // Also trigger if we're inside an unclosed wiki-link and typing
    const region = findWikiLinkAtPosition(text, pos);
    if (region && !region.isClosed) {
      setTimeout(() => {
        startCompletion(update.view);
      }, 0);
    }
  });
}

/**
 * Create the wiki-link autocomplete extension.
 *
 * @param {Object} options
 * @param {Function} options.getDocs - Async function returning docs array
 * @param {Function} options.onCreateDoc - Async function to create a doc from title
 * @returns {Array} - CodeMirror extensions
 */
export function wikiLinkAutocomplete({ getDocs, onCreateDoc }) {
  return [
    autocompletion({
      override: [wikiLinkCompletionSource({ getDocs, onCreateDoc })],
      activateOnTyping: false, // We trigger manually
      closeOnBlur: true,
      maxRenderedOptions: 10,
      defaultKeymap: true,
      icons: false,
    }),
    wikiLinkTrigger(),
  ];
}
