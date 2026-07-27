const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const MAX_PREVIEW_CHARACTERS = 220;

/// Reduces Markdown source to the plain sentence or two a list row shows.
///
/// This is deliberately shallow: it strips the syntax a first paragraph
/// usually carries and leaves everything else alone. A list preview that is
/// slightly wrong is a cosmetic problem, so nothing here is worth a real
/// Markdown parse on every row.
export function notePreview(source: string): string {
  const body = source.replace(FRONT_MATTER, "");

  const text = body
    // Fenced code, images, and HTML tags read as noise at preview size.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    // Wikilinks and links keep their label, not their target.
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Leading block syntax: headings, quotes, list bullets, task boxes.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ")
    // Inline emphasis and code markers.
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/(\*\*|__|\*|_|~~|==)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > MAX_PREVIEW_CHARACTERS
    ? `${text.slice(0, MAX_PREVIEW_CHARACTERS).trimEnd()}…`
    : text;
}

/// Previews are cached against the file's modified time so an edit elsewhere
/// invalidates them, and a re-scan that changes nothing does not.
export function notePreviewKey(
  relativePath: string,
  modifiedMillis?: number,
): string {
  return `${relativePath}@${modifiedMillis ?? 0}`;
}
