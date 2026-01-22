/**
 * Document Type Frontmatter Registry
 *
 * Canonical registry of known document types and their allowed/required frontmatter keys.
 * Advisory in v0 - missing required keys and unknown keys emit warnings only.
 */

/**
 * Legacy key aliases
 * @type {Record<string, string>}
 */
export const FRONTMATTER_KEY_ALIASES = {
  id: "uuid",
};

/**
 * Document type registry
 * @type {import('./types.js').DocumentTypeRegistry}
 */
export const DOCUMENT_TYPE_REGISTRY = {
  inbox: {
    type: "inbox",
    label: "Inbox",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "visibility",
      "title",
      "type",
    ],
    requiredKeys: ["id", "createdAt", "type"],
  },

  note: {
    type: "note",
    label: "Note",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "archivedAt",
      "visibility",
      "title",
      "type",
      "subtype",
      "tags",
      "source",
      "chains",
    ],
    requiredKeys: ["id", "createdAt", "type"],
  },

  reference: {
    type: "reference",
    label: "Reference",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "archivedAt",
      "visibility",
      "title",
      "type",
      "tags",
      "source",
      "status",
    ],
    requiredKeys: ["id", "createdAt", "title", "type"],
  },

  source: {
    type: "source",
    label: "Source",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "archivedAt",
      "visibility",
      "title",
      "subtitle",
      "type",
      "subtype",
      "tags",
      "status",
      "url",
      "series",
      "seriesNumber",
      "author",
      "host",
      "guests",
      "startDate",
      "endDate",
    ],
    requiredKeys: ["id", "createdAt", "type", "subtype"],
  },

  journal: {
    type: "journal",
    label: "Journal",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "archivedAt",
      "visibility",
      "title",
      "type",
      "subtype",
      "tags",
      "series",
      "seriesNumber",
      "mood",
    ],
    requiredKeys: ["id", "createdAt", "type"],
  },

  daily: {
    type: "daily",
    label: "Daily",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "archivedAt",
      "visibility",
      "title",
      "type",
      "tags",
    ],
    requiredKeys: ["id", "createdAt", "type"],
  },

  essay: {
    type: "essay",
    label: "Essay",
    allowedKeys: [
      "id",
      "uuid",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "archivedAt",
      "visibility",
      "title",
      "subtitle",
      "type",
      "subtype",
      "tags",
      "resources",
    ],
    requiredKeys: ["id", "createdAt", "type"],
  },
};
