import type { AnchoredDocument } from "./documents";
import { resolveWikilink, wikilinksInContent } from "./links";

export type DocumentActivity = {
  firstSeenAt: number;
  lastActiveAt: number;
};

export type WikilinkCandidate = {
  activityAt: number;
  detail: string;
  documentId?: string;
  kind: "note" | "alias" | "unresolved";
  label: string;
  referenceCount?: number;
  target: string;
};

const MARKDOWN_EXTENSION = /\.md$/i;
const UNSAFE_TARGET = /[|#\n\r]/;
const UNSAFE_LABEL = /\||\]\]|[\n\r]/;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(MARKDOWN_EXTENSION, "");
}

function filenameStem(document: AnchoredDocument): string {
  return withoutMarkdownExtension(document.name);
}

function folderForPath(relativePath: string): string {
  const separator = relativePath.lastIndexOf("/");
  return separator === -1 ? "Vault root" : relativePath.slice(0, separator);
}

function safeTarget(value: string): boolean {
  return (
    value.length > 0 &&
    !UNSAFE_TARGET.test(value) &&
    !value.includes("[") &&
    !value.includes("]")
  );
}

function safeLabel(value: string): boolean {
  return value.length > 0 && !UNSAFE_LABEL.test(value);
}

export function shortestWikilinkTarget(
  document: AnchoredDocument,
  documents: AnchoredDocument[],
): string | null {
  if (!document.relativePath) return null;

  const stem = filenameStem(document);
  const duplicateCount = documents.filter(
    (candidate) =>
      candidate.relativePath &&
      normalized(filenameStem(candidate)) === normalized(stem),
  ).length;
  const target =
    duplicateCount === 1
      ? stem
      : withoutMarkdownExtension(document.relativePath);

  return safeTarget(target) ? target : null;
}

function outgoingTargets(document: AnchoredDocument): string[] {
  return document.sourceText === undefined
    ? document.outgoingLinks
    : wikilinksInContent(document.sourceText).map((link) => link.target);
}

function unresolvedTarget(rawTarget: string): string | null {
  const target = rawTarget.trim();
  if (!target || target.startsWith("#")) return null;

  const noteTarget = withoutMarkdownExtension(target.split("#", 1)[0].trim());
  return safeTarget(noteTarget) ? noteTarget : null;
}

export function buildWikilinkCandidates(
  documents: AnchoredDocument[],
  activity: ReadonlyMap<string, DocumentActivity>,
): WikilinkCandidate[] {
  const candidates: WikilinkCandidate[] = [];

  for (const document of documents) {
    const target = shortestWikilinkTarget(document, documents);
    if (!target || !document.relativePath) continue;

    const documentActivity = activity.get(document.id);
    const activityAt = Math.max(
      documentActivity?.firstSeenAt ?? 0,
      documentActivity?.lastActiveAt ?? 0,
    );
    const folder = folderForPath(document.relativePath);
    const stem = filenameStem(document);
    candidates.push({
      activityAt,
      detail: folder,
      documentId: document.id,
      kind: "note",
      label: stem,
      target,
    });

    for (const alias of document.aliases) {
      const label = alias.trim();
      if (!safeLabel(label) || normalized(label) === normalized(stem)) {
        continue;
      }
      candidates.push({
        activityAt,
        detail: `Alias · ${folder}`,
        documentId: document.id,
        kind: "alias",
        label,
        target: `${target}|${label}`,
      });
    }
  }

  const unresolved = new Map<
    string,
    { label: string; referenceCount: number; target: string }
  >();
  for (const source of documents) {
    const sourcePlaceholders = new Set<string>();
    for (const rawTarget of outgoingTargets(source)) {
      if (
        resolveWikilink(rawTarget, documents, source.id).status !== "missing"
      ) {
        continue;
      }
      const target = unresolvedTarget(rawTarget);
      if (!target) continue;
      const key = normalized(target);
      if (sourcePlaceholders.has(key)) continue;
      sourcePlaceholders.add(key);
      const current = unresolved.get(key);
      unresolved.set(key, {
        label: target.split("/").pop() ?? target,
        referenceCount: (current?.referenceCount ?? 0) + 1,
        target: current?.target ?? target,
      });
    }
  }

  for (const placeholder of unresolved.values()) {
    candidates.push({
      activityAt: 0,
      detail: `Uncreated · ${placeholder.referenceCount} reference${
        placeholder.referenceCount === 1 ? "" : "s"
      }`,
      kind: "unresolved",
      label: placeholder.label,
      referenceCount: placeholder.referenceCount,
      target: placeholder.target,
    });
  }

  return candidates;
}

function subsequenceMatch(query: string, value: string): boolean {
  let queryIndex = 0;
  for (const character of value) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function matchScore(
  candidate: WikilinkCandidate,
  query: string,
): number | null {
  const label = normalized(candidate.label);
  const target = normalized(candidate.target.split("|", 1)[0]);
  const terms =
    candidate.kind === "alias" || label === target ? [label] : [label, target];
  let score: number | null = null;

  for (const term of terms) {
    let termScore: number | null = null;
    if (term === query) termScore = 0;
    else if (term.startsWith(query)) termScore = 10;
    else if (term.split(/[\s/_-]+/).some((word) => word.startsWith(query))) {
      termScore = 20;
    } else if (term.includes(query)) termScore = 30;
    else if (subsequenceMatch(query, term)) termScore = 40;
    if (termScore !== null && (score === null || termScore < score)) {
      score = termScore;
    }
  }

  if (score === null) return null;
  if (candidate.kind === "alias") return score + 1;
  if (candidate.kind === "unresolved") return score + 100;
  return score;
}

export function rankWikilinkCandidates(
  candidates: WikilinkCandidate[],
  query: string,
  currentDocumentId?: string,
  limit = 24,
): WikilinkCandidate[] {
  const normalizedQuery = normalized(query);
  if (!normalizedQuery) {
    return [...candidates]
      .filter(
        (candidate) =>
          candidate.kind === "note" &&
          candidate.documentId !== currentDocumentId,
      )
      .sort(
        (left, right) =>
          right.activityAt - left.activityAt ||
          left.label.localeCompare(right.label),
      )
      .slice(0, limit);
  }

  const ranked = candidates
    .flatMap((candidate) => {
      const score = matchScore(candidate, normalizedQuery);
      return score === null ? [] : [{ candidate, score }];
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        right.candidate.activityAt - left.candidate.activityAt ||
        (right.candidate.referenceCount ?? 0) -
          (left.candidate.referenceCount ?? 0) ||
        left.candidate.label.localeCompare(right.candidate.label),
    )
    .map(({ candidate }) => candidate);
  const hasExactCandidate = ranked.some(
    (candidate) =>
      normalized(candidate.label) === normalizedQuery ||
      normalized(candidate.target.split("|", 1)[0]) === normalizedQuery,
  );
  const typedPlaceholder =
    !hasExactCandidate && safeTarget(query.trim())
      ? {
          activityAt: 0,
          detail: "New uncreated link",
          kind: "unresolved" as const,
          label: query.trim(),
          referenceCount: 0,
          target: query.trim(),
        }
      : null;

  return typedPlaceholder
    ? [...ranked.slice(0, Math.max(0, limit - 1)), typedPlaceholder]
    : ranked.slice(0, limit);
}
