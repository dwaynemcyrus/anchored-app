/**
 * Wiki-link search and ranking for autocomplete.
 *
 * Ranking rules (from spec):
 * 1) Exact slug match (starts-with or equals slug)
 * 2) Exact title match
 * 3) Prefix match on title
 * 4) Substring match on title
 * 5) Prefix match on slug
 * 6) Substring match on slug
 *
 * Tie-breakers:
 * - status: active > complete > archived
 * - more recently updated higher
 * - shorter title higher (optional)
 */

const STATUS_PRIORITY = {
  active: 0,
  complete: 1,
  archived: 2,
};

function normalizeForSearch(text) {
  if (!text) return "";
  return text.trim().toLowerCase();
}

function getMatchScore(query, doc) {
  const q = normalizeForSearch(query);
  if (!q) return 0;

  const title = normalizeForSearch(doc.title);
  const slug = normalizeForSearch(doc.slug);

  // 1) Exact slug match or slug starts with query
  if (slug && slug === q) return 600;
  if (slug && slug.startsWith(q)) return 550;

  // 2) Exact title match
  if (title === q) return 500;

  // 3) Prefix match on title
  if (title.startsWith(q)) return 400;

  // 4) Substring match on title
  if (title.includes(q)) return 300;

  // 5) Prefix match on slug
  if (slug && slug.startsWith(q)) return 200;

  // 6) Substring match on slug
  if (slug && slug.includes(q)) return 100;

  return 0;
}

function getStatusScore(doc) {
  // Lower is better, so we'll subtract from a base
  const archivedAt = doc.archivedAt;
  if (archivedAt != null) return STATUS_PRIORITY.archived;
  // We don't have explicit "complete" status in current schema
  // Treating non-archived as active
  return STATUS_PRIORITY.active;
}

/**
 * Search documents for wiki-link autocomplete.
 *
 * @param {Array} docs - Array of doc metadata from getDocsForLinkSearch()
 * @param {string} query - Search query (trimmed)
 * @param {number} limit - Max results to return (default 8)
 * @returns {Array} - Ranked search results
 */
export function searchDocsForLink(docs, query, limit = 8) {
  if (!Array.isArray(docs) || docs.length === 0) {
    return [];
  }

  if (!query || !query.trim()) {
    // Return recent docs when no query
    return docs
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit);
  }

  const q = query.trim();

  // Score and filter docs
  const scored = docs
    .map((doc) => ({
      doc,
      matchScore: getMatchScore(q, doc),
      statusScore: getStatusScore(doc),
    }))
    .filter((item) => item.matchScore > 0);

  // Sort by: matchScore desc, statusScore asc, updatedAt desc, title length asc
  scored.sort((a, b) => {
    // Higher match score first
    if (a.matchScore !== b.matchScore) {
      return b.matchScore - a.matchScore;
    }
    // Lower status score first (active before archived)
    if (a.statusScore !== b.statusScore) {
      return a.statusScore - b.statusScore;
    }
    // More recently updated first
    const aTime = a.doc.updatedAt || 0;
    const bTime = b.doc.updatedAt || 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    // Shorter title first
    const aLen = (a.doc.title || "").length;
    const bLen = (b.doc.title || "").length;
    return aLen - bLen;
  });

  return scored.slice(0, limit).map((item) => item.doc);
}

/**
 * Check if there's an exact match for the query (by slug or title).
 *
 * @param {Array} docs - Array of doc metadata
 * @param {string} query - Search query
 * @returns {Object | null} - Matching doc or null
 */
export function findExactMatch(docs, query) {
  if (!Array.isArray(docs) || docs.length === 0) return null;
  if (!query || !query.trim()) return null;

  const q = normalizeForSearch(query);

  // Check slug first
  const slugMatch = docs.find(
    (doc) => doc.slug && normalizeForSearch(doc.slug) === q
  );
  if (slugMatch) return slugMatch;

  // Then check title
  const titleMatch = docs.find(
    (doc) => normalizeForSearch(doc.title) === q
  );
  return titleMatch || null;
}

/**
 * Resolve a wiki-link target to a document.
 * Resolution order: exact slug → exact title
 *
 * @param {Array} docs - Array of doc metadata
 * @param {string} target - Link target text
 * @returns {Object | null} - Matching doc or null
 */
export function resolveWikiLink(docs, target) {
  return findExactMatch(docs, target);
}
