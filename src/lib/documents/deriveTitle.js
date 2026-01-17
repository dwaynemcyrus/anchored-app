const DEFAULT_TITLE = "Untitled";

export function deriveDocumentTitle(document) {
  const title = typeof document?.title === "string" ? document.title.trim() : "";
  if (title) return title;
  if (!document || typeof document.body !== "string") return DEFAULT_TITLE;
  const lines = document.body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return DEFAULT_TITLE;
}
