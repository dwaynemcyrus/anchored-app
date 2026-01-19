/**
 * Generate a safe filename from a note title.
 *
 * Rules from spec:
 * - Lowercased
 * - Spaces -> hyphens
 * - Strip non-alphanumerics except hyphen/underscore
 * - Max 60 chars
 * - If empty, use "untitled"
 *
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function safeFilename(title) {
  if (!title || typeof title !== "string") {
    return "untitled";
  }

  let safe = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")           // Spaces to hyphens
    .replace(/[^a-z0-9_-]/g, "")    // Strip invalid chars
    .replace(/-+/g, "-")            // Collapse multiple hyphens
    .replace(/^-|-$/g, "");         // Trim leading/trailing hyphens

  if (safe === "") {
    return "untitled";
  }

  if (safe.length > 60) {
    safe = safe.slice(0, 60).replace(/-$/, ""); // Don't end on hyphen
  }

  return safe;
}

/**
 * Get the ID suffix for filename uniqueness.
 * Uses last 8 characters of ID.
 *
 * @param {string} id
 * @returns {string}
 */
export function idSuffix(id) {
  if (!id || typeof id !== "string") {
    return "unknown";
  }
  // Remove hyphens from UUID-style IDs for cleaner suffix
  const clean = id.replace(/-/g, "");
  return clean.slice(-8);
}

/**
 * Generate a full filename for a note in the markdown bundle.
 *
 * @param {string | null | undefined} title
 * @param {string} id
 * @returns {string} - e.g., "my-note__a1b2c3d4.md"
 */
export function noteFilename(title, id) {
  const safePart = safeFilename(title);
  const suffix = idSuffix(id);
  return `${safePart}__${suffix}.md`;
}
