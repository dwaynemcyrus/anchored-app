/**
 * CodeMirror 6 autocomplete extension for wiki-links.
 *
 * Triggers autocomplete when user types [[ and provides
 * document suggestions with search and ranking.
 */

import { autocompletion, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { findWikiLinkAtPosition } from "../wikilinks/parser";
import { searchDocsForLink, findExactMatch } from "../wikilinks/linkSearch";

const DEBOUNCE_MS = 80;

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
    if (!region) return null;

    // Already closed - don't show autocomplete
    if (region.isClosed) return null;

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
    const results = searchDocsForLink(cachedDocs, query, 8);

    // Build completion options
    const options = results.map((doc) => ({
      label: doc.title || "Untitled",
      detail: doc.slug || formatDate(doc.updatedAt),
      type: "text",
      boost: 0,
      apply: (view, completion, from, to) => {
        applyCompletion(view, doc.title || "Untitled", from, to);
      },
    }));

    // Add "Create" option if query has content and no exact match
    if (query.length > 0) {
      const hasExactMatch = findExactMatch(cachedDocs, query);
      if (!hasExactMatch) {
        options.push({
          label: `Create "${query}"`,
          type: "keyword",
          boost: -1,
          apply: (view, completion, from, to) => {
            // Create the doc and insert link
            if (onCreateDoc) {
              onCreateDoc(query).then((doc) => {
                if (doc) {
                  applyCompletion(view, doc.title || query, from, to);
                }
              });
            } else {
              applyCompletion(view, query, from, to);
            }
          },
        });
      }
    }

    if (options.length === 0) return null;

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
  const cursorPos = from + title.length + (hasClosing ? 0 : 2);

  view.dispatch({
    changes: { from, to: hasClosing ? to : to, insert: insertText },
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
 * Key handler to trigger autocomplete on [[
 */
const wikiLinkKeyHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    if (event.key === "[") {
      const { state } = view;
      const pos = state.selection.main.head;
      const text = state.doc.toString();

      // Check if previous char is also [
      if (pos > 0 && text[pos - 1] === "[") {
        // Schedule autocomplete after the [ is inserted
        setTimeout(() => {
          startCompletion(view);
        }, 10);
      }
    }
    return false;
  },
});

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
      activateOnTyping: true,
      closeOnBlur: true,
      maxRenderedOptions: 10,
      defaultKeymap: true,
      icons: false,
    }),
    wikiLinkKeyHandler,
  ];
}
