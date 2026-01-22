/**
 * Frontmatter Normalization + Schema Diff
 *
 * Normalizes frontmatter and computes schema differences (warnings/errors).
 * Advisory only - never blocks saving, never writes to disk.
 */

import { parseBaseFrontmatter, getBaseKeys } from "./base.js";
import { DOCUMENT_TYPE_REGISTRY, FRONTMATTER_KEY_ALIASES } from "./registry.js";

/**
 * Normalize frontmatter and compute schema diff
 *
 * @param {Record<string, any>} raw - Raw frontmatter object
 * @returns {import('./types.js').NormalizedFrontmatterResult}
 */
export function normalizeFrontmatter(raw) {
  // 1. Parse base + alias
  const { base, normalized, warnings, errors } = parseBaseFrontmatter(raw);

  /** @type {string[]} */
  const unknownKeys = [];
  /** @type {string[]} */
  const missingRequiredKeys = [];
  /** @type {import('./types.js').DocumentTypeSpec | null} */
  let typeSpec = null;
  /** @type {string | undefined} */
  let unknownType;

  // 2. Determine type
  const typeValue = normalized.type;

  if (typeValue === undefined || typeValue === null || typeValue === "") {
    // Error already added by parseBaseFrontmatter
  } else {
    // 3. Lookup registry by type
    typeSpec = DOCUMENT_TYPE_REGISTRY[typeValue] || null;

    if (!typeSpec) {
      unknownType = String(typeValue);
      warnings.push(`Unknown document type: ${unknownType}`);
    }
  }

  // 4. Compute unknownKeys
  const allowedSet = buildAllowedKeysSet(typeSpec);
  const rawKeys = Object.keys(raw);

  for (const key of rawKeys) {
    if (!allowedSet.has(key)) {
      unknownKeys.push(key);
      warnings.push(`Unknown frontmatter key: ${key}`);
    }
  }

  // 5. Compute missingRequiredKeys
  if (typeSpec) {
    for (const requiredKey of typeSpec.requiredKeys) {
      if (!isKeySatisfied(requiredKey, normalized)) {
        missingRequiredKeys.push(requiredKey);
        warnings.push(`Missing required key: ${requiredKey}`);
      }
    }
  }

  return {
    base,
    typeSpec,
    normalized,
    warnings,
    errors,
    unknownKeys,
    missingRequiredKeys,
    unknownType,
  };
}

/**
 * Build the set of allowed keys for a document type
 *
 * @param {import('./types.js').DocumentTypeSpec | null} typeSpec
 * @returns {Set<string>}
 */
function buildAllowedKeysSet(typeSpec) {
  const allowed = getBaseKeys();

  if (typeSpec) {
    for (const key of typeSpec.allowedKeys) {
      allowed.add(key);
    }
  }

  return allowed;
}

/**
 * Check if a required key is satisfied (considering aliases)
 *
 * For example, if "id" is required, it's satisfied if either "id" or "uuid" exists.
 *
 * @param {string} requiredKey - The required key
 * @param {Record<string, any>} normalized - Normalized frontmatter
 * @returns {boolean}
 */
function isKeySatisfied(requiredKey, normalized) {
  // Direct presence
  if (normalized[requiredKey] !== undefined) {
    return true;
  }

  // Check if this key has an alias that's present
  const canonicalKey = FRONTMATTER_KEY_ALIASES[requiredKey];
  if (canonicalKey && normalized[canonicalKey] !== undefined) {
    return true;
  }

  // Check if a key that aliases to this one is present
  for (const [alias, canonical] of Object.entries(FRONTMATTER_KEY_ALIASES)) {
    if (canonical === requiredKey && normalized[alias] !== undefined) {
      return true;
    }
  }

  return false;
}
