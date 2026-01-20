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

const NON_WORD_BOUNDARY_REGEX = /[^a-z0-9\s]/gi;

/**
 * Normalize text for search indexing and matching.
 * - Lowercase
 * - Trim whitespace
 * - Strip punctuation boundaries
 * - Collapse whitespace
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeForSearch(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .trim()
    .replace(NON_WORD_BOUNDARY_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize text for search matching.
 *
 * @param {string} text
 * @returns {Array<string>}
 */
export function tokenizeForSearch(text) {
  const normalized = normalizeForSearch(text);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}
