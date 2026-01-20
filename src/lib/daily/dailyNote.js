import { DOCUMENT_TYPE_DAILY } from "../../types/document";

const TIMEZONE = "Europe/Zurich";

/**
 * Get today's date string in YYYY-MM-DD format using Europe/Zurich timezone.
 * @returns {string}
 */
export function getTodayDateString() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Get today's slug in format: daily/YYYY-MM-DD
 * @returns {string}
 */
export function getTodaySlug() {
  return `daily/${getTodayDateString()}`;
}

/**
 * Build frontmatter object for a daily note.
 * @param {string} dateString - YYYY-MM-DD format
 * @returns {Record<string, any>}
 */
export function buildDailyMeta(dateString) {
  return {
    date: dateString,
  };
}

/**
 * Build the input object for creating a daily note.
 * @param {string} dateString - YYYY-MM-DD format
 * @returns {object}
 */
export function buildDailyNoteInput(dateString) {
  const slug = `daily/${dateString}`;
  return {
    type: DOCUMENT_TYPE_DAILY,
    slug,
    title: null,
    body: "",
    meta: buildDailyMeta(dateString),
  };
}
