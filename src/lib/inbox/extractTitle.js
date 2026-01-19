/**
 * Extract a title from note body.
 *
 * Rules:
 * - Find first non-empty line
 * - Strip leading markdown markers (headings, lists, blockquotes, tasks)
 * - Trim whitespace
 * - Truncate to max 80 characters
 * - Return null if result is empty
 *
 * @param {string} body
 * @returns {string | null}
 */
export function extractTitleFromBody(body) {
  if (typeof body !== "string") {
    return null;
  }

  const lines = body.split(/\r?\n/);

  // Find first non-empty line
  let firstLine = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      firstLine = trimmed;
      break;
    }
  }

  if (!firstLine) {
    return null;
  }

  // Strip markdown markers
  let title = stripMarkdownMarkers(firstLine);

  // Trim whitespace
  title = title.trim();

  // If empty after stripping, return null
  if (!title) {
    return null;
  }

  // Truncate to 80 characters
  if (title.length > 80) {
    title = title.slice(0, 80).trim();
  }

  return title;
}

/**
 * Strip leading markdown markers from a line.
 *
 * @param {string} line
 * @returns {string}
 */
function stripMarkdownMarkers(line) {
  let result = line;

  // Headings: # ## ### etc. (strip # and following space)
  result = result.replace(/^#{1,6}\s*/, "");

  // Task list: - [ ] or - [x] or - [X]
  result = result.replace(/^-\s*\[[xX ]\]\s*/, "");

  // Unordered list: - * +
  result = result.replace(/^[-*+]\s+/, "");

  // Ordered list: 1. or 1)
  result = result.replace(/^\d+[.)]\s+/, "");

  // Blockquote: >
  result = result.replace(/^>\s*/, "");

  return result;
}
