/**
 * Parse a timestamp value into epoch milliseconds.
 * Supports ISO strings and epoch milliseconds (number or string).
 *
 * @param {string | number | null | undefined} value
 * @returns {number | null} - Epoch milliseconds or null if invalid/missing
 */
export function parseTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  // If it's a number, assume epoch milliseconds
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return value;
  }

  // If it's a string, try parsing
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    // Check if it's a numeric string (epoch ms)
    const numericValue = Number(trimmed);
    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue) && numericValue >= 0) {
      // Heuristic: if it's a large number, it's likely epoch ms
      // ISO dates parsed as numbers would be NaN or small
      if (/^\d+$/.test(trimmed)) {
        return numericValue;
      }
    }

    // Try parsing as ISO string
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    return null;
  }

  return null;
}

/**
 * Convert epoch milliseconds to ISO string.
 *
 * @param {number | null | undefined} epochMs
 * @returns {string | null}
 */
export function toISOString(epochMs) {
  if (epochMs === null || epochMs === undefined) {
    return null;
  }
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) {
    return null;
  }
  try {
    return new Date(epochMs).toISOString();
  } catch {
    return null;
  }
}
