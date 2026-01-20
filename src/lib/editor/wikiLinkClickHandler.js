/**
 * CodeMirror 6 extension for wiki-link click handling.
 *
 * Detects clicks on wiki-links and triggers navigation or creation.
 */

import { EditorView } from "@codemirror/view";
import { parseWikiLinks } from "../wikilinks/parser";

/**
 * Find wiki-link at a given position.
 *
 * @param {string} text - Document text
 * @param {number} pos - Click position
 * @returns {{target: string, start: number, end: number} | null}
 */
function findWikiLinkAt(text, pos) {
  const links = parseWikiLinks(text);
  return links.find((link) => pos >= link.start && pos <= link.end) || null;
}

/**
 * Create a wiki-link click handler extension.
 *
 * @param {Object} options
 * @param {Function} options.onNavigate - Called with doc when navigating to existing doc
 * @param {Function} options.onCreateAndNavigate - Called with target when creating new doc
 * @param {Function} options.resolveLink - Async function to resolve target to doc
 * @returns {Array} - CodeMirror extensions
 */
export function wikiLinkClickHandler({ onNavigate, onCreateAndNavigate, resolveLink }) {
  return EditorView.domEventHandlers({
    click(event, view) {
      // Check if click is on a wiki-link
      const target = event.target;
      if (!target.closest(".cm-wikilink")) {
        return false;
      }

      // Get click position in document
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const text = view.state.doc.toString();
      const link = findWikiLinkAt(text, pos);

      if (!link || !link.target) {
        return false;
      }

      // Prevent default editor behavior
      event.preventDefault();
      event.stopPropagation();

      // Resolve and navigate
      handleLinkClick(link.target, { onNavigate, onCreateAndNavigate, resolveLink });

      return true;
    },
  });
}

/**
 * Handle wiki-link click: resolve, navigate, or create.
 */
async function handleLinkClick(target, { onNavigate, onCreateAndNavigate, resolveLink }) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return;

  try {
    // Try to resolve the link
    const doc = resolveLink ? await resolveLink(trimmedTarget) : null;

    if (doc) {
      // Found existing doc - navigate to it
      if (onNavigate) {
        onNavigate(doc);
      }
    } else {
      // No match - create and navigate
      if (onCreateAndNavigate) {
        onCreateAndNavigate(trimmedTarget);
      }
    }
  } catch (err) {
    console.error("Failed to handle wiki-link click:", err);
  }
}
