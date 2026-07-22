export function normalizeMarkdownLineEndings(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

export function hasNonUnixLineEndings(source: string): boolean {
  return /\r/.test(source);
}

export function markdownBodyStart(source: string): number | null {
  const bomLength = source.startsWith("\uFEFF") ? 1 : 0;
  const body = source.slice(bomLength);
  const newlineLength = body.startsWith("---\r\n")
    ? 2
    : body.startsWith("---\n")
      ? 1
      : 0;
  if (newlineLength === 0) return null;

  const openingEnd = bomLength + 3 + newlineLength;
  let lineStart = openingEnd;
  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? source.length : newline + 1;
    const line = source.slice(lineStart, lineEnd).replace(/\r?\n$/, "");

    if (line === "---" || line === "...") {
      const bodyStart = lineEnd + newlineLength;
      return bodyStart <= source.length ? bodyStart : null;
    }

    if (lineEnd === source.length) break;
    lineStart = lineEnd;
  }

  return null;
}

export function mergeCreatedMarkdownSource(
  originalSource: string,
  persistedSource: string,
  currentSource: string,
): string {
  if (currentSource === originalSource) return persistedSource;

  if (originalSource.length === 0) {
    const separator = persistedSource.endsWith("\n") ? "" : "\n";
    return `${persistedSource}${separator}${currentSource}`;
  }

  const originalStart = persistedSource.indexOf(originalSource);
  if (originalStart < 0) return currentSource;

  return `${persistedSource.slice(0, originalStart)}${currentSource}${persistedSource.slice(originalStart + originalSource.length)}`;
}
