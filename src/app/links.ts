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

export type WikilinkCompletionContext = {
  from: number;
  query: string;
};

export type DocumentLinkIndex = {
  backlinksByTargetId: ReadonlyMap<string, AnchoredDocument[]>;
  byAlias: ReadonlyMap<string, string[]>;
  byFilename: ReadonlyMap<string, string[]>;
  byPath: ReadonlyMap<string, string[]>;
  filenameCounts: ReadonlyMap<string, number>;
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

function linesWithEndings(content: string): string[] {
  const lines: string[] = [];
  let start = 0;

  while (start < content.length) {
    const newline = content.indexOf("\n", start);
    if (newline === -1) {
      lines.push(content.slice(start));
      return lines;
    }
    lines.push(content.slice(start, newline + 1));
    start = newline + 1;
  }

  if (content.length === 0 || content.endsWith("\n")) lines.push("");
  return lines;
}

export function wikilinkAtOffset(
  content: string,
  offset: number,
): WikilinkMatch | null {
  return (
    wikilinksInContent(content).find(
      (link) => offset >= link.start && offset <= link.end,
    ) ?? null
  );
}

export function wikilinksInContent(content: string): WikilinkMatch[] {
  const { bodyStart, frontMatterEnd, frontMatterStart } =
    markdownBounds(content);
  const body = content.slice(bodyStart);
  const links: WikilinkMatch[] = [];
  if (frontMatterEnd !== undefined && frontMatterStart !== undefined) {
    inspectQuotedPropertyWikilinks(
      content.slice(frontMatterStart, frontMatterEnd),
      frontMatterStart,
      links,
    );
  }
  let lineOffset = bodyStart;
  let fenceMarker: string | undefined;
  let fenceLength = 0;

  for (const lineWithEnding of linesWithEndings(body)) {
    const line = lineWithEnding.replace(/\r?\n$/, "");
    if (/^( {4}|\t)/.test(line)) {
      lineOffset += lineWithEnding.length;
      continue;
    }
    const fenceMatch = line.match(/^ {0,3}(`{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (fenceMarker === marker && length >= fenceLength) {
        fenceMarker = undefined;
        fenceLength = 0;
      } else if (fenceMarker === undefined) {
        fenceMarker = marker;
        fenceLength = length;
      }
      lineOffset += lineWithEnding.length;
      continue;
    }
    if (fenceMarker === undefined) {
      inspectInlineWikilinks(line, lineOffset, links);
    }
    lineOffset += lineWithEnding.length;
  }
  return links;
}

export function wikilinkCompletionAtOffset(
  content: string,
  offset: number,
): WikilinkCompletionContext | null {
  if (offset < 0 || offset > content.length) return null;
  const { bodyStart, frontMatterEnd, frontMatterStart } =
    markdownBounds(content);
  if (
    frontMatterStart !== undefined &&
    frontMatterEnd !== undefined &&
    offset >= frontMatterStart &&
    offset <= frontMatterEnd
  ) {
    return quotedPropertyCompletion(
      content.slice(frontMatterStart, offset),
      frontMatterStart,
    );
  }
  if (offset < bodyStart) return null;

  let lineOffset = bodyStart;
  let fenceMarker: string | undefined;
  let fenceLength = 0;
  for (const lineWithEnding of linesWithEndings(content.slice(bodyStart))) {
    const line = lineWithEnding.replace(/\r?\n$/, "");
    const lineEnd = lineOffset + line.length;
    const fenceMatch = line.match(/^ {0,3}(`{3,})/);
    const isFenceLine = Boolean(fenceMatch);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (fenceMarker === marker && length >= fenceLength) {
        fenceMarker = undefined;
        fenceLength = 0;
      } else if (fenceMarker === undefined) {
        fenceMarker = marker;
        fenceLength = length;
      }
    }

    if (offset >= lineOffset && offset <= lineEnd) {
      if (isFenceLine || fenceMarker !== undefined || /^( {4}|\t)/.test(line)) {
        return null;
      }
      return inlineCompletion(line.slice(0, offset - lineOffset), lineOffset);
    }
    lineOffset += lineWithEnding.length;
  }
  return null;
}

function completionFromQuery(
  query: string,
  from: number,
): WikilinkCompletionContext | null {
  return /[|`\n\r]/.test(query) || query.includes("[") || query.includes("]")
    ? null
    : { from, query };
}

function quotedPropertyCompletion(
  yaml: string,
  yamlOffset: number,
): WikilinkCompletionContext | null {
  let index = 0;
  let quote: '"' | "'" | undefined;
  while (index < yaml.length) {
    const character = yaml[index];
    if (!quote) {
      if (character === "#") {
        const lineEnd = yaml.indexOf("\n", index);
        index = lineEnd === -1 ? yaml.length : lineEnd + 1;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      index += 1;
      continue;
    }
    if (quote === '"' && character === "\\") {
      index += 2;
      continue;
    }
    if (quote === "'" && character === "'" && yaml[index + 1] === "'") {
      index += 2;
      continue;
    }
    if (character === quote) {
      quote = undefined;
      index += 1;
      continue;
    }
    if (yaml.startsWith("[[", index)) {
      const closing = yaml.indexOf("]]", index + 2);
      if (closing === -1) {
        return completionFromQuery(
          yaml.slice(index + 2),
          yamlOffset + index + 2,
        );
      }
      index = closing + 2;
      continue;
    }
    index += 1;
  }
  return null;
}

function inlineCompletion(
  line: string,
  lineOffset: number,
): WikilinkCompletionContext | null {
  let index = 0;
  let inlineCodeDelimiter = 0;
  while (index < line.length) {
    if (line[index] === "`" && !isEscaped(line, index)) {
      let length = 1;
      while (line[index + length] === "`") length += 1;
      if (inlineCodeDelimiter === 0) inlineCodeDelimiter = length;
      else if (inlineCodeDelimiter === length) inlineCodeDelimiter = 0;
      index += length;
      continue;
    }
    if (
      inlineCodeDelimiter === 0 &&
      line.startsWith("[[", index) &&
      !isEscaped(line, index)
    ) {
      const closing = line.indexOf("]]", index + 2);
      if (closing === -1) {
        return completionFromQuery(
          line.slice(index + 2),
          lineOffset + index + 2,
        );
      }
      index = closing + 2;
      continue;
    }
    index += 1;
  }
  return null;
}

function markdownBounds(content: string): {
  bodyStart: number;
  frontMatterEnd?: number;
  frontMatterStart?: number;
} {
  const bomLength = content.startsWith("\ufeff") ? 1 : 0;
  const body = content.slice(bomLength);
  const opening = body.startsWith("---\r\n")
    ? 5
    : body.startsWith("---\n")
      ? 4
      : 0;
  if (opening === 0) return { bodyStart: bomLength };

  let lineStart = bomLength + opening;
  while (lineStart <= content.length) {
    const lineEnd = content.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? content.length : lineEnd;
    const line = content.slice(lineStart, end).replace(/\r$/, "");
    if (line === "---" || line === "...") {
      return {
        bodyStart: lineEnd === -1 ? content.length : lineEnd + 1,
        frontMatterEnd: lineStart,
        frontMatterStart: bomLength + opening,
      };
    }
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }
  return { bodyStart: content.length };
}

function inspectQuotedPropertyWikilinks(
  yaml: string,
  yamlOffset: number,
  links: WikilinkMatch[],
) {
  let index = 0;
  let quote: '"' | "'" | undefined;
  while (index < yaml.length) {
    const character = yaml[index];
    if (!quote) {
      if (character === "#") {
        const lineEnd = yaml.indexOf("\n", index);
        index = lineEnd === -1 ? yaml.length : lineEnd + 1;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      index += 1;
      continue;
    }
    if (quote === '"' && character === "\\") {
      index += 2;
      continue;
    }
    if (quote === "'" && character === "'" && yaml[index + 1] === "'") {
      index += 2;
      continue;
    }
    if (character === quote) {
      quote = undefined;
      index += 1;
      continue;
    }
    if (yaml.startsWith("[[", index)) {
      const closing = yaml.indexOf("]]", index + 2);
      if (closing === -1) break;
      const [targetPart, labelPart] = yaml
        .slice(index + 2, closing)
        .split("|", 2);
      const target = targetPart.trim();
      if (target) {
        links.push({
          end: yamlOffset + closing + 2,
          label: labelPart?.trim() || target,
          start: yamlOffset + index,
          target,
        });
      }
      index = closing + 2;
      continue;
    }
    index += 1;
  }
}

function inspectInlineWikilinks(
  line: string,
  lineOffset: number,
  links: WikilinkMatch[],
) {
  let index = 0;
  let inlineCodeDelimiter = 0;
  while (index < line.length) {
    if (line[index] === "`" && !isEscaped(line, index)) {
      let length = 1;
      while (line[index + length] === "`") length += 1;
      if (inlineCodeDelimiter === 0) inlineCodeDelimiter = length;
      else if (inlineCodeDelimiter === length) inlineCodeDelimiter = 0;
      index += length;
      continue;
    }
    if (
      inlineCodeDelimiter === 0 &&
      line.startsWith("[[", index) &&
      !isEscaped(line, index)
    ) {
      const closing = line.indexOf("]]", index + 2);
      if (closing === -1) break;
      const [targetPart, labelPart] = line
        .slice(index + 2, closing)
        .split("|", 2);
      const target = targetPart.trim();
      if (target) {
        const embedded = index > 0 && line[index - 1] === "!";
        links.push({
          end: lineOffset + closing + 2,
          label: labelPart?.trim() || target,
          start: lineOffset + index - (embedded ? 1 : 0),
          target,
        });
      }
      index = closing + 2;
      continue;
    }
    index += 1;
  }
}

function isEscaped(content: string, index: number): boolean {
  let backslashes = 0;
  for (
    let offset = index - 1;
    offset >= 0 && content[offset] === "\\";
    offset--
  ) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function addIndexValue(
  index: Map<string, string[]>,
  key: string,
  documentId: string,
): void {
  const values = index.get(key);
  if (values) {
    if (!values.includes(documentId)) values.push(documentId);
  } else {
    index.set(key, [documentId]);
  }
}

export function buildDocumentLinkIndex(
  documents: AnchoredDocument[],
): DocumentLinkIndex {
  const byAlias = new Map<string, string[]>();
  const byFilename = new Map<string, string[]>();
  const byPath = new Map<string, string[]>();
  const filenameCounts = new Map<string, number>();

  for (const document of documents) {
    if (
      !document.relativePath ||
      document.isMarkdown === false ||
      document.isRecoveryCopy
    )
      continue;
    const filename = normalized(withoutMarkdownExtension(document.name));
    const path = normalized(
      withoutMarkdownExtension(document.relativePath),
    ).replace(/^\.\//, "");
    addIndexValue(byFilename, filename, document.id);
    addIndexValue(byPath, path, document.id);
    filenameCounts.set(filename, (filenameCounts.get(filename) ?? 0) + 1);
    for (const alias of document.aliases) {
      const normalizedAlias = normalized(alias);
      if (normalizedAlias) addIndexValue(byAlias, normalizedAlias, document.id);
    }
  }

  const index: DocumentLinkIndex = {
    backlinksByTargetId: new Map(),
    byAlias,
    byFilename,
    byPath,
    filenameCounts,
  };
  const backlinksByTargetId = new Map<string, AnchoredDocument[]>();
  for (const source of documents) {
    if (source.isMarkdown === false || source.isRecoveryCopy) continue;
    const outgoingLinks =
      source.sourceText !== undefined &&
      !source.sourceText.replace(/^\ufeff/, "").startsWith("---")
        ? wikilinksInContent(source.sourceText).map((link) => link.target)
        : source.outgoingLinks;
    const linkedTargets = new Set<string>();
    for (const target of outgoingLinks) {
      const resolution = resolveWikilinkFromIndex(target, index, source.id);
      if (
        resolution.status !== "resolved" ||
        resolution.documentId === source.id ||
        linkedTargets.has(resolution.documentId)
      ) {
        continue;
      }
      linkedTargets.add(resolution.documentId);
      const backlinks = backlinksByTargetId.get(resolution.documentId);
      if (backlinks) backlinks.push(source);
      else backlinksByTargetId.set(resolution.documentId, [source]);
    }
  }
  return { ...index, backlinksByTargetId };
}

function resolutionFromIds(documentIds: string[] = []): WikilinkResolution {
  if (documentIds.length === 1) {
    return { status: "resolved", documentId: documentIds[0] };
  }
  if (documentIds.length > 1) {
    return { status: "ambiguous", matches: [...documentIds] };
  }
  return { status: "missing" };
}

export function resolveWikilinkFromIndex(
  rawTarget: string,
  index: DocumentLinkIndex,
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

  const pathMatches = index.byPath.get(normalizedPath);
  if (pathMatches) return resolutionFromIds(pathMatches);
  const filenameMatches = index.byFilename.get(normalizedTarget);
  if (filenameMatches) return resolutionFromIds(filenameMatches);
  return resolutionFromIds(index.byAlias.get(normalizedTarget));
}

export function resolveWikilink(
  rawTarget: string,
  documents: AnchoredDocument[],
  currentDocumentId: string,
): WikilinkResolution {
  return resolveWikilinkFromIndex(
    rawTarget,
    buildDocumentLinkIndex(documents),
    currentDocumentId,
  );
}

export function backlinksForDocument(
  documents: AnchoredDocument[],
  targetDocumentId: string,
  index = buildDocumentLinkIndex(documents),
): AnchoredDocument[] {
  return index.backlinksByTargetId.get(targetDocumentId) ?? [];
}
