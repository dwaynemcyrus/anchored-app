/**
 * Template Service
 *
 * Core logic for template operations: listing, resolution, and document creation.
 */

import { getDocumentsRepo } from "../repo/getDocumentsRepo.js";
import { DOCUMENT_TYPE_TEMPLATE } from "../../types/document.js";
import {
  BUILT_IN_TEMPLATES,
  getBuiltInTemplateDefinition,
} from "./definitions.js";

/**
 * Get all templates from the repository
 * @returns {Promise<import('./types.js').Template[]>}
 */
export async function getTemplates() {
  const repo = getDocumentsRepo();
  // Use list with type filter - returns list items, need to get full docs
  const listItems = await repo.list({ type: DOCUMENT_TYPE_TEMPLATE });
  // Fetch full template documents
  const templates = await Promise.all(
    listItems.map((item) => repo.get(item.id))
  );
  return templates.filter(Boolean);
}

/**
 * Get templates for a specific document type
 * @param {string} type - Target document type
 * @returns {Promise<import('./types.js').Template[]>}
 */
export async function getTemplatesForType(type) {
  const templates = await getTemplates();
  return templates.filter((t) => t.templateFor === type);
}

/**
 * Get a single template by ID
 * @param {string} id
 * @returns {Promise<import('./types.js').Template | null>}
 */
export async function getTemplate(id) {
  const repo = getDocumentsRepo();
  return repo.get(id);
}

/**
 * Get the capture template (for quick capture bypass)
 * @returns {Promise<import('./types.js').Template | null>}
 */
export async function getCaptureTemplate() {
  const templates = await getTemplatesForType("capture");
  return templates[0] || null;
}

/**
 * Create a document from a template
 * @param {string} templateId - Template ID to use
 * @param {Object} [overrides] - Optional field overrides
 * @param {string} [overrides.body] - Override body content (appended after frontmatter)
 * @param {number} [overrides.inboxAt] - Set inbox timestamp
 * @returns {Promise<import('../../types/document.js').Document | null>}
 */
export async function createFromTemplate(templateId, overrides = {}) {
  const template = await getTemplate(templateId);
  if (!template) {
    console.error(`Template not found: ${templateId}`);
    return null;
  }

  const resolved = resolveTemplate(template.body);
  const repo = getDocumentsRepo();

  // Parse the resolved frontmatter to extract fields
  const parsed = parseFrontmatterBlock(resolved.frontmatter);

  // Build document input
  const input = {
    type: parsed.type || template.templateFor,
    title: parsed.title || null,
    body: resolved.content + (overrides.body || ""),
    meta: { ...parsed, type: undefined, title: undefined },
    inboxAt: overrides.inboxAt,
  };

  // Clean up meta - remove fields that are top-level
  delete input.meta.type;
  delete input.meta.title;

  const doc = await repo.create(input);
  return doc;
}

/**
 * Reset a built-in template to its default content
 * @param {string} templateId - Built-in template ID
 * @returns {Promise<boolean>}
 */
export async function resetBuiltInTemplate(templateId) {
  const definition = getBuiltInTemplateDefinition(templateId);
  if (!definition) {
    console.error(`Not a built-in template: ${templateId}`);
    return false;
  }

  const repo = getDocumentsRepo();
  const existing = await repo.get(templateId);

  if (!existing) {
    console.error(`Template not found in repo: ${templateId}`);
    return false;
  }

  await repo.update(templateId, {
    body: definition.body,
    title: definition.title,
  });

  return true;
}

/**
 * Reset all built-in templates to their defaults
 * @returns {Promise<void>}
 */
export async function resetAllBuiltInTemplates() {
  for (const definition of BUILT_IN_TEMPLATES) {
    await resetBuiltInTemplate(definition.id);
  }
}

/**
 * Resolve template variables and return frontmatter + content
 * @param {string} templateBody - Raw template body
 * @returns {{ frontmatter: string, content: string }}
 */
function resolveTemplate(templateBody) {
  const now = new Date();
  const createdAt = now.toISOString();
  const date = createdAt.slice(0, 10); // YYYY-MM-DD

  // Replace template variables
  let resolved = templateBody
    .replace(/\{\{createdAt\}\}/g, createdAt)
    .replace(/\{\{date\}\}/g, date);

  // Split into frontmatter and content
  const match = resolved.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (match) {
    return {
      frontmatter: match[1],
      content: match[2] || "",
    };
  }

  // No frontmatter block found, treat entire body as content
  return {
    frontmatter: "",
    content: resolved,
  };
}

/**
 * Parse a frontmatter string into an object
 * @param {string} frontmatter - YAML-like frontmatter content
 * @returns {Record<string, any>}
 */
function parseFrontmatterBlock(frontmatter) {
  const result = {};
  const lines = frontmatter.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Parse value types
    if (value === '""' || value === "''") {
      result[key] = "";
    } else if (value === "[]") {
      result[key] = [];
    } else if (value === "true") {
      result[key] = true;
    } else if (value === "false") {
      result[key] = false;
    } else if (value === "null") {
      result[key] = null;
    } else if (/^-?\d+$/.test(value)) {
      result[key] = parseInt(value, 10);
    } else if (/^-?\d+\.\d+$/.test(value)) {
      result[key] = parseFloat(value);
    } else if (value.startsWith('"') && value.endsWith('"')) {
      result[key] = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      result[key] = value.slice(1, -1);
    } else {
      result[key] = value;
    }
  }

  return result;
}
