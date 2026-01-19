/**
 * Backup & Restore v0 — Type Definitions
 *
 * @typedef {Object} BackupNoteV1
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string} createdAt - ISO string
 * @property {string} updatedAt - ISO string
 * @property {string | null} deletedAt - ISO string or null
 * @property {string | null} archivedAt - ISO string or null
 */

/**
 * @typedef {Object} BackupStatsV1
 * @property {number} notesCount
 * @property {number} totalChars
 */

/**
 * @typedef {Object} BackupSourceV1
 * @property {string} platform
 * @property {string} userAgent
 */

/**
 * @typedef {Object} BackupV1
 * @property {1} backupVersion
 * @property {string} exportedAt - ISO string
 * @property {string} appVersion
 * @property {BackupSourceV1} source
 * @property {BackupStatsV1} stats
 * @property {BackupNoteV1[]} notes
 */

/**
 * @typedef {Object} ImportPlanItem
 * @property {"add" | "update" | "skip" | "conflict"} action
 * @property {BackupNoteV1} incoming
 * @property {string | null} existingId - ID of existing note if applicable
 */

/**
 * @typedef {Object} ImportPlan
 * @property {ImportPlanItem[]} items
 * @property {number} addCount
 * @property {number} updateCount
 * @property {number} skipCount
 * @property {number} conflictCount
 */

/**
 * @typedef {Object} DryRunResult
 * @property {boolean} success
 * @property {"backupJson" | "markdownZip"} format
 * @property {number} backupVersion
 * @property {number} totalIncoming
 * @property {ImportPlan} plan
 * @property {string} [error]
 */

/**
 * @typedef {Object} ImportResult
 * @property {boolean} success
 * @property {number} added
 * @property {number} updated
 * @property {number} skipped
 * @property {number} conflicts
 * @property {string[]} conflictIds - IDs of newly created conflict notes
 * @property {string} [error]
 */

export const BACKUP_VERSION = 1;
export const BUNDLE_VERSION = 1;
