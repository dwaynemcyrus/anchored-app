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
 * Create a new blank template with scaffold structure
 * @param {Object} [options]
 * @param {string} [options.templateFor='note'] - Target document type
 * @param {string} [options.templateForSubtype] - Optional subtype
 * @returns {Promise<import('./types.js').Template>}
 */
export async function createTemplateScaffold(options = {}) {
  const { templateFor = "note", templateForSubtype } = options;

  const now = Date.now();
  const repo = getDocumentsRepo();

  // Build scaffold body with minimal frontmatter
  const frontmatterLines = [`type: ${templateFor}`];
  if (templateForSubtype) {
    frontmatterLines.push(`subtype: ${templateForSubtype}`);
  }
  frontmatterLines.push('title: ""');

  const body = `---\n${frontmatterLines.join("\n")}\n---\n\n`;

  const template = {
    id: `template-${now}`,
    type: DOCUMENT_TYPE_TEMPLATE,
    slug: null,
    title: "New Template",
    body,
    meta: {
      templateFor,
      templateForSubtype: templateForSubtype || null,
      isBuiltIn: false,
    },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    archivedAt: null,
  };

  await repo.insertTemplate(template);
  return template;
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
 * Prepare template content for insertion into an existing document
 * Resolves variables and returns frontmatter fields + body content
 * @param {import('./types.js').Template} template
 * @returns {{ frontmatter: Record<string, any>, content: string }}
 */
export function prepareTemplateForInsertion(template) {
  const resolved = resolveTemplate(template.body);
  const frontmatter = parseFrontmatterBlock(resolved.frontmatter);
  return {
    frontmatter,
    content: resolved.content,
  };
}

/**
 * Merge template frontmatter into existing frontmatter
 * Rules: additive only, never overwrite, arrays concatenate (dedupe)
 * @param {Record<string, any>} existing - Current document frontmatter
 * @param {Record<string, any>} template - Template frontmatter to merge
 * @returns {Record<string, any>}
 */
export function mergeFrontmatter(existing, template) {
  const result = { ...existing };

  for (const [key, templateValue] of Object.entries(template)) {
    // Skip if existing has a non-empty value for this key
    if (key in result) {
      const existingValue = result[key];

      // Arrays: concatenate and dedupe
      if (Array.isArray(existingValue) && Array.isArray(templateValue)) {
        const combined = [...existingValue, ...templateValue];
        result[key] = [...new Set(combined)];
        continue;
      }

      // Objects: shallow merge, existing keys win
      if (
        existingValue &&
        typeof existingValue === "object" &&
        templateValue &&
        typeof templateValue === "object" &&
        !Array.isArray(existingValue)
      ) {
        result[key] = { ...templateValue, ...existingValue };
        continue;
      }

      // Strings/other: keep existing if non-empty
      if (existingValue !== "" && existingValue !== null) {
        continue;
      }
    }

    // Add template value
    result[key] = templateValue;
  }

  return result;
}

/**
 * Serialize frontmatter object back to YAML-like string
 * @param {Record<string, any>} frontmatter
 * @returns {string}
 */
export function serializeFrontmatter(frontmatter) {
  const lines = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined) continue;

    if (value === null) {
      lines.push(`${key}: null`);
    } else if (value === "") {
      lines.push(`${key}: ""`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`);
      }
    } else if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "string") {
      // Quote strings that contain special characters
      if (value.includes(":") || value.includes("#") || value.includes("\n")) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
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
