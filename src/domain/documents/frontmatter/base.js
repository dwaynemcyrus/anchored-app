/**
 * Base Frontmatter Parser
 *
 * Parses and normalizes base frontmatter keys with legacy alias handling.
 * Does not generate UUIDs, validate formats as blocking, or mutate files.
 */

import { FRONTMATTER_KEY_ALIASES } from "./registry.js";

/**
 * Base frontmatter keys (system-level)
 */
const BASE_KEYS = ["uuid", "createdAt", "updatedAt", "type", "status", "slug"];

/**
 * Parse base frontmatter from raw object
 *
 * @param {Record<string, any>} raw - Raw frontmatter object
 * @returns {import('./types.js').ParseBaseFrontmatterResult}
 */
export function parseBaseFrontmatter(raw) {
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const errors = [];

  // Start with a copy of raw
  const normalized = { ...raw };

  // Handle id -> uuid aliasing
  if (normalized.uuid === undefined && normalized.id !== undefined) {
    normalized.uuid = normalized.id;
    warnings.push("frontmatter.id is legacy; use uuid");
  }

  // Build base object if we have minimum required fields
  const hasUuid = normalized.uuid !== undefined;
  const hasCreatedAt = normalized.createdAt !== undefined;
  const hasType = normalized.type !== undefined;

  if (!hasType) {
    errors.push("Missing or invalid type");
  }

  /** @type {import('./types.js').BaseFrontmatter | null} */
  let base = null;

  if (hasUuid && hasCreatedAt && hasType) {
    base = {
      uuid: String(normalized.uuid),
      createdAt: String(normalized.createdAt),
      type: String(normalized.type),
    };

    // Add optional fields if present
    if (normalized.updatedAt !== undefined) {
      base.updatedAt = String(normalized.updatedAt);
    }
    if (normalized.status !== undefined) {
      base.status = normalized.status;
    }
    if (normalized.slug !== undefined) {
      base.slug = String(normalized.slug);
    }
  }

  return {
    base,
    normalized,
    warnings,
    errors,
  };
}

/**
 * Get the canonical key for a potentially aliased key
 *
 * @param {string} key - Key to resolve
 * @returns {string} - Canonical key
 */
export function resolveKeyAlias(key) {
  return FRONTMATTER_KEY_ALIASES[key] || key;
}

/**
 * Get the set of base keys (including legacy aliases)
 *
 * @returns {Set<string>}
 */
export function getBaseKeys() {
  const keys = new Set(BASE_KEYS);
  // Add legacy aliases
  for (const alias of Object.keys(FRONTMATTER_KEY_ALIASES)) {
    keys.add(alias);
  }
  return keys;
}
