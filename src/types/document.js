/**
 * @typedef {Object} Document
 * @property {string} id
 * @property {string} type
 * @property {string | null} slug
 * @property {string | null} title
 * @property {string} body
 * @property {Record<string, any>} meta
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number | null | undefined} deletedAt
 * @property {number | null | undefined} archivedAt
 */

export const DOCUMENT_TYPE_NOTE = "note";
export const DOCUMENT_TYPE_DAILY = "daily";
