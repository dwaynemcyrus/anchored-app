const DEFAULT_TITLE = "Untitled";

const STRIP_PREFIX = /^#{1,6}\s+|^\*\s+|^\d+\.\s+|^>\s+/;

export function deriveDocumentTitle(document) {
  const title = typeof document?.title === "string" ? document.title.trim() : "";
  if (title) return title.replace(STRIP_PREFIX, "");
  if (!document || typeof document.body !== "string") return DEFAULT_TITLE;
  const lines = document.body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.replace(STRIP_PREFIX, "");
  }
  return DEFAULT_TITLE;
}
