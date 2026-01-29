type TimestampInput = string | number | Date;

export function ensureIsoTimestamp(
  value: TimestampInput | null | undefined,
  fallback?: string | null
): string | null {
  if (!value) {
    if (fallback === null) return null;
    return fallback ?? new Date().toISOString();
  }
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return fallback ?? new Date().toISOString();
}

export function parseIsoTimestamp(
  value: string | null | undefined,
  fallback: number | null = null
): number | null {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : timestamp;
}
