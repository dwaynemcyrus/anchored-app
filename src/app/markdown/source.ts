export function normalizeMarkdownLineEndings(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

export function hasNonUnixLineEndings(source: string): boolean {
  return /\r/.test(source);
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
