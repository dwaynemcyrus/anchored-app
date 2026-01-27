export function ensureIsoTimestamp(value, fallback) {
  if (!value) {
    if (fallback === null) return null;
    return fallback ?? new Date().toISOString();
  }
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return fallback ?? new Date().toISOString();
}

export function parseIsoTimestamp(value, fallback = null) {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : timestamp;
}
