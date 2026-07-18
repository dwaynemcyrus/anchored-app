export function normalizeMarkdownLineEndings(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

export function hasNonUnixLineEndings(source: string): boolean {
  return /\r/.test(source);
}
