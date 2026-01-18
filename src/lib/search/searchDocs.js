import { normalizeQuery, normalizeText } from "./normalize";

const MAX_RESULTS = 50;
const SNIPPET_LENGTH = 120;
const SNIPPET_CONTEXT = 40;

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate a snippet around the first match in text.
 * @param {string} text - Original text
 * @param {string} normalizedQuery - Normalized query
 * @returns {string}
 */
function generateSnippet(text, normalizedQuery) {
  // Clean text for display (replace newlines with spaces)
  const cleanText = text.replace(/[\r\n]+/g, " ");

  // Find actual match position in the cleaned text (case-insensitive)
  const lowerClean = cleanText.toLowerCase();
  const matchIndex = lowerClean.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    // No match found, return first portion
    return cleanText.trim().slice(0, SNIPPET_LENGTH);
  }

  // Calculate snippet boundaries around the match
  const snippetStart = Math.max(0, matchIndex - SNIPPET_CONTEXT);
  const snippetEnd = Math.min(cleanText.length, snippetStart + SNIPPET_LENGTH);

  let snippet = cleanText.slice(snippetStart, snippetEnd).trim();

  if (snippetStart > 0) {
    snippet = "…" + snippet;
  }
  if (snippetEnd < cleanText.length) {
    snippet = snippet + "…";
  }

  return snippet;
}

/**
 * Score a document against a search query.
 * Higher score = better match.
 * @param {string} normalizedTitle
 * @param {string} normalizedBody
 * @param {string} normalizedQuery
 * @param {RegExp} queryRegex - Pre-compiled regex for counting occurrences
 * @returns {{ score: number, matchInTitle: boolean, bodyHasMatch: boolean }}
 */
function scoreDocument(normalizedTitle, normalizedBody, normalizedQuery, queryRegex) {
  const titleIndex = normalizedTitle.indexOf(normalizedQuery);
  const bodyIndex = normalizedBody.indexOf(normalizedQuery);

  const matchInTitle = titleIndex !== -1;
  const matchInBody = bodyIndex !== -1;

  if (!matchInTitle && !matchInBody) {
    return { score: -1, matchInTitle: false, bodyHasMatch: false };
  }

  // Base score: title match = 1000, body only = 100
  let score = matchInTitle ? 1000 : 100;

  // Earlier occurrence is better (subtract position penalty)
  const matchIndex = matchInTitle ? titleIndex : bodyIndex;
  score -= matchIndex * 0.1;

  // Count occurrences (optional bonus)
  const titleCount = matchInTitle
    ? (normalizedTitle.match(queryRegex) || []).length
    : 0;
  const bodyCount = matchInBody
    ? (normalizedBody.match(queryRegex) || []).length
    : 0;
  score += (titleCount + bodyCount) * 0.5;

  return { score, matchInTitle, bodyHasMatch: matchInBody };
}

/**
 * Search documents by query.
 *
 * @param {Array<{ id: string, title: string, body: string, updatedAt?: number }>} docs
 * @param {string} query
 * @returns {Array<{ id: string, title: string, snippet: string, score: number, updatedAt?: number }>}
 */
export function searchDocs(docs, query) {
  const normalizedQuery = normalizeQuery(query);

  // Don't search if query too short
  if (normalizedQuery.length < 2) {
    return [];
  }

  // Pre-compile regex once for the entire search
  const queryRegex = new RegExp(escapeRegex(normalizedQuery), "g");

  const results = [];

  for (const doc of docs) {
    const normalizedTitle = normalizeText(doc.title || "");
    const normalizedBody = normalizeText(doc.body || "");

    const { score, matchInTitle, bodyHasMatch } = scoreDocument(
      normalizedTitle,
      normalizedBody,
      normalizedQuery,
      queryRegex
    );
    if (score < 0) continue;

    const snippet = matchInTitle && !bodyHasMatch
      ? (doc.body || "").replace(/[\r\n]+/g, " ").trim().slice(0, SNIPPET_LENGTH)
      : generateSnippet(doc.body || "", normalizedQuery);

    results.push({
      id: doc.id,
      title: doc.title || "Untitled",
      snippet,
      score,
      updatedAt: doc.updatedAt,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, MAX_RESULTS);
}
