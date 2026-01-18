/**
 * Normalize a search query for matching.
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple whitespace to single space
 *
 * @param {string} query
 * @returns {string}
 */
export function normalizeQuery(query) {
  if (typeof query !== "string") return "";
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Normalize text for search matching.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.toLowerCase().replace(/\s+/g, " ");
}
