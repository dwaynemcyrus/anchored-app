import { normalizeQuery, normalizeText } from "./normalize";

const MAX_RESULTS = 50;
const SNIPPET_LENGTH = 120;
const SNIPPET_CONTEXT = 40;

/**
 * Generate a snippet around the first match in text.
 * @param {string} text - Original text
 * @param {string} normalizedText - Normalized version for matching
 * @param {string} normalizedQuery - Normalized query
 * @returns {string}
 */
function generateSnippet(text, normalizedText, normalizedQuery) {
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex === -1) {
    // No match in body, return first portion
    const clean = text.replace(/[\r\n]+/g, " ").trim();
    return clean.slice(0, SNIPPET_LENGTH);
  }

  // Find approximate position in original text
  // Since normalization collapses whitespace, find closest match
  const beforeNormalized = normalizedText.slice(0, matchIndex);
  const roughStart = Math.max(0, beforeNormalized.length - SNIPPET_CONTEXT);
  const roughEnd = Math.min(text.length, roughStart + SNIPPET_LENGTH);

  let snippet = text.slice(roughStart, roughEnd);
  snippet = snippet.replace(/[\r\n]+/g, " ").trim();

  if (roughStart > 0) {
    snippet = "…" + snippet;
  }
  if (roughEnd < text.length) {
    snippet = snippet + "…";
  }

  return snippet;
}

/**
 * Score a document against a search query.
 * Higher score = better match.
 * @param {{ title: string, body: string }} doc
 * @param {string} normalizedQuery
 * @returns {{ score: number, matchInTitle: boolean, matchIndex: number }}
 */
function scoreDocument(doc, normalizedQuery) {
  const normalizedTitle = normalizeText(doc.title || "");
  const normalizedBody = normalizeText(doc.body || "");

  const titleIndex = normalizedTitle.indexOf(normalizedQuery);
  const bodyIndex = normalizedBody.indexOf(normalizedQuery);

  const matchInTitle = titleIndex !== -1;
  const matchInBody = bodyIndex !== -1;

  if (!matchInTitle && !matchInBody) {
    return { score: -1, matchInTitle: false, matchIndex: -1 };
  }

  // Base score: title match = 1000, body only = 100
  let score = matchInTitle ? 1000 : 100;

  // Earlier occurrence is better (subtract position penalty)
  const matchIndex = matchInTitle ? titleIndex : bodyIndex;
  score -= matchIndex * 0.1;

  // Count occurrences (optional bonus)
  const titleCount = matchInTitle
    ? (normalizedTitle.match(new RegExp(escapeRegex(normalizedQuery), "g")) || []).length
    : 0;
  const bodyCount = matchInBody
    ? (normalizedBody.match(new RegExp(escapeRegex(normalizedQuery), "g")) || []).length
    : 0;
  score += (titleCount + bodyCount) * 0.5;

  return { score, matchInTitle, matchIndex };
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const results = [];

  for (const doc of docs) {
    const { score, matchInTitle } = scoreDocument(doc, normalizedQuery);
    if (score < 0) continue;

    const normalizedBody = normalizeText(doc.body || "");
    const snippet = matchInTitle && normalizedBody.indexOf(normalizedQuery) === -1
      ? (doc.body || "").replace(/[\r\n]+/g, " ").trim().slice(0, SNIPPET_LENGTH)
      : generateSnippet(doc.body || "", normalizedBody, normalizedQuery);

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
