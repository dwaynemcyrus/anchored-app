/**
 * Document Frontmatter Types
 *
 * Type definitions for the frontmatter registry system.
 * This is a schema declaration layer only - no sync, tombstones, or behavior branching.
 */

/**
 * Base frontmatter schema (system-level keys)
 * @typedef {Object} BaseFrontmatter
 * @property {string} uuid - Canonical document identity (documentId)
 * @property {string} createdAt - ISO timestamp
 * @property {string} [updatedAt] - ISO timestamp
 * @property {string} type - Registry type
 * @property {("active"|"deleted")} [status] - Document status (advisory in v0)
 * @property {string} [slug] - URL-friendly identifier
 */

/**
 * Document type specification
 * @typedef {Object} DocumentTypeSpec
 * @property {string} type - Type identifier
 * @property {string} label - Human-readable label
 * @property {string[]} allowedKeys - Includes base + legacy + type-specific keys (deduped)
 * @property {string[]} requiredKeys - Advisory in v0
 * @property {string} [description] - Optional description
 */

/**
 * Registry of document types
 * @typedef {Record<string, DocumentTypeSpec>} DocumentTypeRegistry
 */

/**
 * Result of normalizing frontmatter
 * @typedef {Object} NormalizedFrontmatterResult
 * @property {BaseFrontmatter|null} base - Parsed base frontmatter
 * @property {DocumentTypeSpec|null} typeSpec - Matched type specification
 * @property {Record<string, any>} normalized - Raw + derived values (e.g., uuid from id)
 * @property {string[]} warnings - Non-blocking warnings
 * @property {string[]} errors - Non-blocking errors
 * @property {string[]} unknownKeys - Keys not in allowedKeys
 * @property {string[]} missingRequiredKeys - Required keys not present (after aliasing)
 * @property {string} [unknownType] - Type value if not found in registry
 */

/**
 * Result of parsing base frontmatter
 * @typedef {Object} ParseBaseFrontmatterResult
 * @property {BaseFrontmatter|null} base - Parsed base frontmatter
 * @property {Record<string, any>} normalized - Raw + derived uuid
 * @property {string[]} warnings - Non-blocking warnings
 * @property {string[]} errors - Non-blocking errors
 */

export {};
