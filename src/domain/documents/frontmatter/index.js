/**
 * Document Frontmatter Module
 *
 * Exports the frontmatter registry, types, and normalization utilities.
 * This is a schema declaration layer only - advisory, non-blocking.
 */

// Types (JSDoc only, re-exported for documentation)
export * from "./types.js";

// Registry
export {
  DOCUMENT_TYPE_REGISTRY,
  FRONTMATTER_KEY_ALIASES,
} from "./registry.js";

// Base parser
export {
  parseBaseFrontmatter,
  resolveKeyAlias,
  getBaseKeys,
} from "./base.js";

// Normalization
export { normalizeFrontmatter } from "./normalize.js";
