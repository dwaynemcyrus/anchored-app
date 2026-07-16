import type { AnchoredDocument } from "./documents";

export type WikilinkMatch = {
  end: number;
  label: string;
  start: number;
  target: string;
};

export type WikilinkResolution =
  | { status: "resolved"; documentId: string }
  | { status: "ambiguous"; matches: string[] }
  | { status: "missing" };

const WIKILINK_PATTERN = /!?\[\[([^\]\n]+)\]\]/g;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

export function wikilinkAtOffset(
  content: string,
  offset: number,
): WikilinkMatch | null {
  WIKILINK_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(WIKILINK_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset < start || offset > end) continue;

    const [targetPart, labelPart] = match[1].split("|", 2);
    const target = targetPart.trim();
    if (!target) return null;
    return {
      end,
      label: labelPart?.trim() || target,
      start,
      target,
    };
  }
  return null;
}

export function resolveWikilink(
  rawTarget: string,
  documents: AnchoredDocument[],
  currentDocumentId: string,
): WikilinkResolution {
  const target = rawTarget.trim();
  if (target.startsWith("#")) {
    return { status: "resolved", documentId: currentDocumentId };
  }

  const noteTarget = target.split("#", 1)[0].trim();
  if (!noteTarget) return { status: "missing" };
  const normalizedTarget = normalized(withoutMarkdownExtension(noteTarget));
  const normalizedPath = normalizedTarget.replace(/^\.\//, "");

  const pathMatches = documents.filter((document) => {
    if (!document.relativePath) return false;
    return (
      normalized(withoutMarkdownExtension(document.relativePath)) ===
      normalizedPath
    );
  });
  if (pathMatches.length > 0) return resolutionFrom(pathMatches);

  const filenameMatches = documents.filter(
    (document) =>
      normalized(withoutMarkdownExtension(document.name)) === normalizedTarget,
  );
  if (filenameMatches.length > 0) return resolutionFrom(filenameMatches);

  const aliasMatches = documents.filter((document) =>
    document.aliases.some((alias) => normalized(alias) === normalizedTarget),
  );
  return resolutionFrom(aliasMatches);
}

function resolutionFrom(documents: AnchoredDocument[]): WikilinkResolution {
  const documentIds = Array.from(
    new Set(documents.map((document) => document.id)),
  );
  if (documentIds.length === 1) {
    return { status: "resolved", documentId: documentIds[0] };
  }
  if (documentIds.length > 1) {
    return { status: "ambiguous", matches: documentIds };
  }
  return { status: "missing" };
}
