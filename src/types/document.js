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
 * @property {number | null | undefined} version
 * @property {number | null | undefined} deletedAt
 * @property {number | null | undefined} archivedAt
 */

export const DOCUMENT_TYPE_NOTE = "note";
export const DOCUMENT_TYPE_DAILY = "daily";
export const DOCUMENT_TYPE_TEMPLATE = "_template";
export const DOCUMENT_TYPE_INBOX = "inbox";
export const DOCUMENT_TYPE_REFERENCE = "reference";
export const DOCUMENT_TYPE_SOURCE = "source";
export const DOCUMENT_TYPE_JOURNAL = "journal";
export const DOCUMENT_TYPE_ESSAY = "essay";
export const DOCUMENT_TYPE_STAGED = "staged";
export const DOCUMENT_TYPE_TASK = "task";
export const DOCUMENT_TYPE_PROJECT = "project";
export const DOCUMENT_TYPE_HABIT = "habit";
export const DOCUMENT_TYPE_TIME_ENTRY = "time_entry";
