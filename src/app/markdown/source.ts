export function normalizeMarkdownLineEndings(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

export function hasNonUnixLineEndings(source: string): boolean {
  return /\r/.test(source);
}

export function markdownBodyStartOffset(source: string): number | null {
  if (!/^---(?:\n|$)/.test(source)) return null;

  const closingFence = source.indexOf("\n---", 4);
  if (closingFence < 0) return null;

  const bodyStart = closingFence + 4;
  return source[bodyStart] === "\n" ? bodyStart + 1 : bodyStart;
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
