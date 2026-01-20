import { normalizeForSearch, tokenizeForSearch } from "./normalize";

const DEFAULT_LIMIT = 12;
const SNIPPET_LENGTH = 120;
const SNIPPET_LEADING = 40;
const SNIPPET_TRAILING = 60;

const FIELD_WEIGHT = {
  title: 30,
  slug: 20,
  body: 10,
};

const indexState = {
  entries: [],
  indexById: new Map(),
  ready: false,
};

function rebuildIndexMap(entries) {
  const next = new Map();
  entries.forEach((entry, index) => {
    next.set(entry.id, index);
  });
  return next;
}

function buildIndexEntry(doc) {
  const title = doc.title || "Untitled";
  const slug = doc.slug || null;
  const body = doc.body || "";
  const normalizedTitle = normalizeForSearch(title);
  const normalizedSlug = normalizeForSearch(slug || "");
  const normalizedBody = normalizeForSearch(body);
  const titleTokens = tokenizeForSearch(normalizedTitle);
  const slugTokens = tokenizeForSearch(normalizedSlug);
  const bodyTokens = tokenizeForSearch(normalizedBody);

  return {
    id: doc.id,
    slug,
    title,
    body,
    createdAt: doc.createdAt ?? 0,
    updatedAt: doc.updatedAt ?? 0,
    normalizedTitle,
    normalizedSlug,
    normalizedBody,
    titleTokens,
    slugTokens,
    bodyTokens,
    titleTokenSet: new Set(titleTokens),
    slugTokenSet: new Set(slugTokens),
    bodyTokenSet: new Set(bodyTokens),
  };
}

export function buildSearchIndex(docs = []) {
  const entries = Array.isArray(docs) ? docs.map(buildIndexEntry) : [];
  indexState.entries = entries;
  indexState.indexById = rebuildIndexMap(entries);
  indexState.ready = true;
}

export function ensureSearchIndex(docs = []) {
  if (indexState.ready) return;
  buildSearchIndex(docs);
}

export function updateSearchIndex(doc) {
  if (!doc || typeof doc.id !== "string") return;
  const entry = buildIndexEntry(doc);
  const existingIndex = indexState.indexById.get(entry.id);
  if (existingIndex == null) {
    indexState.entries = indexState.entries.concat(entry);
  } else {
    const next = indexState.entries.slice();
    next[existingIndex] = entry;
    indexState.entries = next;
  }
  indexState.indexById = rebuildIndexMap(indexState.entries);
  indexState.ready = true;
}

export function removeFromSearchIndex(id) {
  if (typeof id !== "string") return;
  const index = indexState.indexById.get(id);
  if (index == null) return;
  const next = indexState.entries.slice();
  next.splice(index, 1);
  indexState.entries = next;
  indexState.indexById = rebuildIndexMap(next);
}

export function clearSearchIndex() {
  indexState.entries = [];
  indexState.indexById = new Map();
  indexState.ready = false;
}

function normalizeWithMap(text) {
  const chars = [];
  const indexMap = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    const lower = text[i].toLowerCase();
    if (/[a-z0-9]/.test(lower)) {
      chars.push(lower);
      indexMap.push(i);
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      chars.push(" ");
      indexMap.push(i);
      lastWasSpace = true;
    }
  }
  while (chars[0] === " ") {
    chars.shift();
    indexMap.shift();
  }
  while (chars[chars.length - 1] === " ") {
    chars.pop();
    indexMap.pop();
  }
  return {
    normalized: chars.join(""),
    map: indexMap,
  };
}

function limitSnippet(text) {
  if (text.length <= SNIPPET_LENGTH) return text;
  return `${text.slice(0, SNIPPET_LENGTH).trimEnd()}...`;
}

function getFirstNonEmptyLine(body) {
  if (!body) return "";
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return limitSnippet(trimmed);
  }
  return "";
}

function getBodySnippet(body, matchText) {
  if (!body) return "";
  const { normalized, map } = normalizeWithMap(body);
  if (!normalized) return "";
  const matchIndex = normalized.indexOf(matchText);
  if (matchIndex === -1) {
    return getFirstNonEmptyLine(body);
  }
  const startIndex = Math.max(0, matchIndex - SNIPPET_LEADING);
  const endIndex = Math.min(
    normalized.length,
    matchIndex + matchText.length + SNIPPET_TRAILING
  );
  const originalStart = map[startIndex] ?? 0;
  const originalEnd = map[endIndex - 1] != null ? map[endIndex - 1] + 1 : body.length;
  let snippet = body.slice(originalStart, originalEnd).replace(/[\r\n]+/g, " ").trim();
  if (originalStart > 0) snippet = `...${snippet}`;
  if (originalEnd < body.length) snippet = `${snippet}...`;
  return limitSnippet(snippet);
}

function getMatchedRanges(text, matchText) {
  if (!text || !matchText) return null;
  const { normalized, map } = normalizeWithMap(text);
  const matchIndex = normalized.indexOf(matchText);
  if (matchIndex === -1) return null;
  const start = map[matchIndex];
  const endIndex = matchIndex + matchText.length - 1;
  const end = map[endIndex] != null ? map[endIndex] + 1 : start + matchText.length;
  if (start == null || end == null) return null;
  return [{ start, end }];
}

function getMatchScore(base, field, matchIndex = 0, matchedTokens = 0) {
  const positionBoost = Math.max(0, 30 - matchIndex);
  return base + FIELD_WEIGHT[field] + matchedTokens * 5 + positionBoost;
}

function getExactTokenMatch(queryTokens, tokenSet, normalizedField) {
  let matchedCount = 0;
  let earliestIndex = Number.POSITIVE_INFINITY;
  let matchToken = "";
  for (const token of queryTokens) {
    if (!tokenSet.has(token)) continue;
    matchedCount += 1;
    const index = normalizedField.indexOf(token);
    if (index !== -1 && index < earliestIndex) {
      earliestIndex = index;
      matchToken = token;
    }
  }
  if (matchedCount === 0) return null;
  return {
    matchedCount,
    matchIndex: Number.isFinite(earliestIndex) ? earliestIndex : 0,
    matchToken,
  };
}

function getPartialTokenMatch(queryTokens, fieldTokens, normalizedField) {
  let matchedCount = 0;
  let earliestIndex = Number.POSITIVE_INFINITY;
  let matchToken = "";
  for (const queryToken of queryTokens) {
    if (!queryToken) continue;
    for (const token of fieldTokens) {
      if (!token.includes(queryToken)) continue;
      matchedCount += 1;
      const index = normalizedField.indexOf(token);
      if (index !== -1 && index < earliestIndex) {
        earliestIndex = index;
        matchToken = token;
      }
      break;
    }
  }
  if (matchedCount === 0) return null;
  return {
    matchedCount,
    matchIndex: Number.isFinite(earliestIndex) ? earliestIndex : 0,
    matchToken,
  };
}

function getMaxDistance(token) {
  const length = token.length;
  if (length >= 3 && length <= 5) return 1;
  if (length >= 6 && length <= 10) return 2;
  if (length > 10) return 2;
  return 0;
}

function boundedEditDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  const prev = new Array(b.length + 1).fill(0);
  const next = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i;
    let rowMin = next[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(
        prev[j] + 1,
        next[j - 1] + 1,
        prev[j - 1] + cost
      );
      rowMin = Math.min(rowMin, next[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = next[j];
    }
  }
  return prev[b.length];
}

function getFuzzyMatch(queryTokens, fieldTokens, normalizedField) {
  let matchedCount = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let matchToken = "";
  let matchIndex = Number.POSITIVE_INFINITY;
  for (const queryToken of queryTokens) {
    const maxDistance = getMaxDistance(queryToken);
    if (maxDistance === 0) continue;
    let tokenMatched = false;
    for (const token of fieldTokens) {
      const distance = boundedEditDistance(queryToken, token, maxDistance);
      if (distance > maxDistance) continue;
      tokenMatched = true;
      if (distance < bestDistance) {
        bestDistance = distance;
        matchToken = token;
        matchIndex = normalizedField.indexOf(token);
      }
    }
    if (tokenMatched) matchedCount += 1;
  }
  if (matchedCount === 0) return null;
  return {
    matchedCount,
    bestDistance,
    matchToken,
    matchIndex: Number.isFinite(matchIndex) ? matchIndex : 0,
  };
}

function evaluateMatch(entry, normalizedQuery, queryTokens) {
  if (entry.normalizedSlug && entry.normalizedSlug === normalizedQuery) {
    return {
      tier: 0,
      field: "slug",
      score: getMatchScore(1000, "slug"),
      matchText: normalizedQuery,
    };
  }

  if (entry.normalizedTitle === normalizedQuery) {
    return {
      tier: 0,
      field: "title",
      score: getMatchScore(900, "title"),
      matchText: normalizedQuery,
    };
  }

  if (entry.normalizedSlug && entry.normalizedSlug.startsWith(normalizedQuery)) {
    return {
      tier: 1,
      field: "slug",
      score: getMatchScore(800, "slug", 0, queryTokens.length),
      matchText: normalizedQuery,
    };
  }

  if (entry.normalizedTitle.startsWith(normalizedQuery)) {
    return {
      tier: 1,
      field: "title",
      score: getMatchScore(780, "title", 0, queryTokens.length),
      matchText: normalizedQuery,
    };
  }

  const titleExact = getExactTokenMatch(
    queryTokens,
    entry.titleTokenSet,
    entry.normalizedTitle
  );
  if (titleExact) {
    return {
      tier: 2,
      field: "title",
      score: getMatchScore(720, "title", titleExact.matchIndex, titleExact.matchedCount),
      matchText: titleExact.matchToken || normalizedQuery,
    };
  }

  const slugExact = getExactTokenMatch(
    queryTokens,
    entry.slugTokenSet,
    entry.normalizedSlug
  );
  if (slugExact) {
    return {
      tier: 2,
      field: "slug",
      score: getMatchScore(700, "slug", slugExact.matchIndex, slugExact.matchedCount),
      matchText: slugExact.matchToken || normalizedQuery,
    };
  }

  if (entry.normalizedTitle.includes(normalizedQuery)) {
    const index = entry.normalizedTitle.indexOf(normalizedQuery);
    return {
      tier: 2,
      field: "title",
      score: getMatchScore(680, "title", index, queryTokens.length),
      matchText: normalizedQuery,
    };
  }

  if (entry.normalizedBody.includes(normalizedQuery)) {
    const index = entry.normalizedBody.indexOf(normalizedQuery);
    return {
      tier: 2,
      field: "body",
      score: getMatchScore(660, "body", index, queryTokens.length),
      matchText: normalizedQuery,
    };
  }

  const titlePartial = getPartialTokenMatch(
    queryTokens,
    entry.titleTokens,
    entry.normalizedTitle
  );
  if (titlePartial) {
    return {
      tier: 3,
      field: "title",
      score: getMatchScore(600, "title", titlePartial.matchIndex, titlePartial.matchedCount),
      matchText: titlePartial.matchToken || normalizedQuery,
    };
  }

  const slugPartial = getPartialTokenMatch(
    queryTokens,
    entry.slugTokens,
    entry.normalizedSlug
  );
  if (slugPartial) {
    return {
      tier: 3,
      field: "slug",
      score: getMatchScore(580, "slug", slugPartial.matchIndex, slugPartial.matchedCount),
      matchText: slugPartial.matchToken || normalizedQuery,
    };
  }

  const bodyPartial = getPartialTokenMatch(
    queryTokens,
    entry.bodyTokens,
    entry.normalizedBody
  );
  if (bodyPartial) {
    return {
      tier: 3,
      field: "body",
      score: getMatchScore(560, "body", bodyPartial.matchIndex, bodyPartial.matchedCount),
      matchText: bodyPartial.matchToken || normalizedQuery,
    };
  }

  return null;
}

function evaluateFuzzyMatch(entry, queryTokens) {
  const titleFuzzy = getFuzzyMatch(queryTokens, entry.titleTokens, entry.normalizedTitle);
  if (titleFuzzy) {
    return {
      tier: 4,
      field: "title",
      score:
        getMatchScore(400, "title", titleFuzzy.matchIndex, titleFuzzy.matchedCount) -
        titleFuzzy.bestDistance * 15,
      matchText: titleFuzzy.matchToken,
    };
  }

  const slugFuzzy = getFuzzyMatch(queryTokens, entry.slugTokens, entry.normalizedSlug);
  if (slugFuzzy) {
    return {
      tier: 4,
      field: "slug",
      score:
        getMatchScore(380, "slug", slugFuzzy.matchIndex, slugFuzzy.matchedCount) -
        slugFuzzy.bestDistance * 15,
      matchText: slugFuzzy.matchToken,
    };
  }

  const bodyFuzzy = getFuzzyMatch(queryTokens, entry.bodyTokens, entry.normalizedBody);
  if (bodyFuzzy) {
    return {
      tier: 4,
      field: "body",
      score:
        getMatchScore(360, "body", bodyFuzzy.matchIndex, bodyFuzzy.matchedCount) -
        bodyFuzzy.bestDistance * 15,
      matchText: bodyFuzzy.matchToken,
    };
  }

  return null;
}

function toSearchResult(entry, match) {
  const field = match?.field || "title";
  const matchText = match?.matchText || "";
  const snippet = field === "body"
    ? getBodySnippet(entry.body, matchText)
    : getFirstNonEmptyLine(entry.body);
  const matchedRanges = match?.field === "title" || match?.field === "slug"
    ? getMatchedRanges(field === "title" ? entry.title : entry.slug || "", matchText)
    : null;

  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    snippet,
    updatedAt: entry.updatedAt,
    createdAt: entry.createdAt,
    matchMeta: match
      ? {
          tier: match.tier,
          field: match.field,
          matchedRanges: matchedRanges || undefined,
        }
      : null,
    score: match?.score ?? 0,
  };
}

function sortResults(a, b) {
  if (a.matchMeta?.tier !== b.matchMeta?.tier) {
    return (a.matchMeta?.tier ?? 99) - (b.matchMeta?.tier ?? 99);
  }
  const scoreDiff = b.score - a.score;
  const maxScore = Math.max(Math.abs(a.score), Math.abs(b.score));
  if (maxScore > 0 && Math.abs(scoreDiff) / maxScore < 0.05) {
    const aTime = a.updatedAt || a.createdAt || 0;
    const bTime = b.updatedAt || b.createdAt || 0;
    if (aTime !== bTime) return bTime - aTime;
  } else if (scoreDiff !== 0) {
    return scoreDiff;
  }
  const aTime = a.updatedAt || a.createdAt || 0;
  const bTime = b.updatedAt || b.createdAt || 0;
  if (aTime !== bTime) return bTime - aTime;
  const aSlug = a.slug || a.id || "";
  const bSlug = b.slug || b.id || "";
  return aSlug.localeCompare(bSlug);
}

function getRecentResults(limit) {
  return indexState.entries
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, limit)
    .map((entry) => toSearchResult(entry, null));
}

export function searchNotes(query, limit = DEFAULT_LIMIT) {
  if (!indexState.ready) return [];
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) {
    return getRecentResults(limit);
  }

  const queryTokens = tokenizeForSearch(normalizedQuery);
  const results = [];
  const matchedIds = new Set();
  let tier0to2Count = 0;

  for (const entry of indexState.entries) {
    const match = evaluateMatch(entry, normalizedQuery, queryTokens);
    if (!match) continue;
    if (match.tier <= 2) tier0to2Count += 1;
    matchedIds.add(entry.id);
    results.push(toSearchResult(entry, match));
  }

  const shouldFuzzy =
    normalizedQuery.length >= 3 && tier0to2Count < 3;
  if (shouldFuzzy) {
    for (const entry of indexState.entries) {
      if (matchedIds.has(entry.id)) continue;
      const match = evaluateFuzzyMatch(entry, queryTokens);
      if (!match) continue;
      results.push(toSearchResult(entry, match));
    }
  }

  return results.sort(sortResults).slice(0, limit);
}
