/**
 * Template Types
 *
 * Type definitions for the document template system.
 */

/**
 * Template document structure
 * @typedef {Object} Template
 * @property {string} id - Unique identifier
 * @property {"_template"} type - Always "_template"
 * @property {string} templateFor - Target document type (e.g., "note", "source")
 * @property {string} [templateForSubtype] - Optional subtype (e.g., "book", "podcast")
 * @property {string} title - Template display name
 * @property {string} body - Raw frontmatter block for new documents
 * @property {number} createdAt - Creation timestamp
 * @property {number} [updatedAt] - Last update timestamp
 * @property {boolean} [isBuiltIn] - True for default templates (non-deletable)
 */

/**
 * Built-in template definition (used for seeding)
 * @typedef {Object} BuiltInTemplateDefinition
 * @property {string} id - Stable identifier for built-in template
 * @property {string} templateFor - Target document type
 * @property {string} [templateForSubtype] - Optional subtype
 * @property {string} title - Display name
 * @property {string} body - Raw frontmatter block
 */

export {};
