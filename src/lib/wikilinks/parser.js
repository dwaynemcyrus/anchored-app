/**
 * Wiki-link parsing utilities.
 *
 * Wiki-link syntax: [[TARGET]]
 * - TARGET is plain text (no pipes/aliases in v1)
 * - Valid characters: any except `]]` terminator
 * - Whitespace is trimmed on both ends
 */

/**
 * Regex to match wiki-links in text.
 * Captures the target text inside [[ and ]]
 */
export const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Parse all wiki-links from text.
 *
 * @param {string} text - Text to parse
 * @returns {Array<{target: string, start: number, end: number}>}
 */
export function parseWikiLinks(text) {
  if (!text) return [];

  const results = [];
  const regex = new RegExp(WIKI_LINK_REGEX.source, "g");
  let match;

  while ((match = regex.exec(text)) !== null) {
    results.push({
      target: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    });
  }

  return results;
}

/**
 * Find the wiki-link region at a given cursor position.
 * Returns null if cursor is not inside an unclosed or closed wiki-link.
 *
 * @param {string} text - Document text
 * @param {number} pos - Cursor position
 * @returns {{start: number, end: number, query: string, isClosed: boolean} | null}
 */
export function findWikiLinkAtPosition(text, pos) {
  if (!text || pos < 0) return null;

  // Look backwards from cursor for [[
  let start = -1;
  for (let i = pos - 1; i >= 0; i--) {
    // Check for [[
    if (i > 0 && text[i - 1] === "[" && text[i] === "[") {
      // Check if there's a ]] between this [[ and cursor
      const between = text.slice(i + 1, pos);
      if (!between.includes("]]")) {
        start = i + 1; // Position after [[
        break;
      }
    }
    // If we hit a ]] before finding [[, we're not in a link
    if (i > 0 && text[i - 1] === "]" && text[i] === "]") {
      break;
    }
  }

  if (start === -1) return null;

  // Check if there's a ]] after cursor
  const afterCursor = text.slice(pos);
  const closingMatch = afterCursor.match(/^[^\[]*?\]\]/);
  const isClosed = closingMatch !== null;
  const end = isClosed ? pos + closingMatch[0].indexOf("]]") + 2 : pos;

  // Extract query (text between [[ and cursor)
  const query = text.slice(start, pos);

  return {
    start: start - 2, // Include [[
    end,
    query: query.trim(),
    rawQuery: query,
    isClosed,
  };
}

/**
 * Check if cursor is inside a wiki-link region.
 *
 * @param {string} text - Document text
 * @param {number} pos - Cursor position
 * @returns {boolean}
 */
export function isInsideWikiLink(text, pos) {
  return findWikiLinkAtPosition(text, pos) !== null;
}

/**
 * Extract the active query from cursor position.
 * This is the text between [[ and cursor, trimmed.
 *
 * @param {string} text - Document text
 * @param {number} pos - Cursor position
 * @returns {{query: string, rawQuery: string, start: number} | null}
 */
export function extractActiveQuery(text, pos) {
  const region = findWikiLinkAtPosition(text, pos);
  if (!region) return null;

  return {
    query: region.query,
    rawQuery: region.rawQuery,
    start: region.start + 2, // Position after [[
  };
}

/**
 * Check if text at position just typed [[
 *
 * @param {string} text - Document text
 * @param {number} pos - Cursor position (after the second [)
 * @returns {boolean}
 */
export function justTypedOpenBrackets(text, pos) {
  if (pos < 2) return false;
  return text[pos - 2] === "[" && text[pos - 1] === "[";
}
