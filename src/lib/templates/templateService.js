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
  const templates = await getTemplatesForType("inbox");
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
const FRONTMATTER_SKIP_KEYS = new Set(["type", "id", "createdAt", "updatedAt"]);

export function mergeFrontmatter(existing, template) {
  const result = { ...existing };

  for (const [key, templateValue] of Object.entries(template)) {
    if (FRONTMATTER_SKIP_KEYS.has(key)) {
      continue;
    }
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
  serializeMapping(frontmatter, 0, lines);
  return lines.join("\n");
}

/**
 * Parse a frontmatter string into an object
 * @param {string} frontmatter - YAML-like frontmatter content
 * @returns {Record<string, any>}
 */
function formatScalar(value) {
  if (value === "") return '""';
  const needsQuotes =
    value.includes(":") ||
    value.includes("#") ||
    value.includes("\n") ||
    value.startsWith("-") ||
    value.startsWith("{") ||
    value.startsWith("[") ||
    value !== value.trim();
  if (needsQuotes) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function serializeMapping(value, indent, lines) {
  const indentStr = " ".repeat(indent);
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (entry === null) {
      lines.push(`${indentStr}${key}: null`);
      continue;
    }
    if (typeof entry === "string" && entry.includes("\n")) {
      lines.push(`${indentStr}${key}: |`);
      const blockIndent = " ".repeat(indent + 2);
      entry.split("\n").forEach((line) => {
        lines.push(`${blockIndent}${line}`);
      });
      continue;
    }
    if (Array.isArray(entry)) {
      if (entry.length === 0) {
        lines.push(`${indentStr}${key}: []`);
        continue;
      }
      lines.push(`${indentStr}${key}:`);
      serializeArray(entry, indent + 2, lines);
      continue;
    }
    if (entry && typeof entry === "object") {
      lines.push(`${indentStr}${key}:`);
      serializeMapping(entry, indent + 2, lines);
      continue;
    }
    if (typeof entry === "string") {
      lines.push(`${indentStr}${key}: ${formatScalar(entry)}`);
      continue;
    }
    lines.push(`${indentStr}${key}: ${entry}`);
  }
}

function serializeArray(value, indent, lines) {
  const indentStr = " ".repeat(indent);
  value.forEach((item) => {
    if (item === null) {
      lines.push(`${indentStr}- null`);
      return;
    }
    if (typeof item === "string") {
      if (item.includes("\n")) {
        lines.push(`${indentStr}- |`);
        const blockIndent = " ".repeat(indent + 2);
        item.split("\n").forEach((line) => {
          lines.push(`${blockIndent}${line}`);
        });
        return;
      }
      lines.push(`${indentStr}- ${formatScalar(item)}`);
      return;
    }
    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${indentStr}- []`);
        return;
      }
      lines.push(`${indentStr}-`);
      serializeArray(item, indent + 2, lines);
      return;
    }
    if (typeof item === "object") {
      lines.push(`${indentStr}-`);
      serializeMapping(item, indent + 2, lines);
      return;
    }
    lines.push(`${indentStr}- ${item}`);
  });
}

function parseScalar(value) {
  if (value === '""' || value === "''") {
    return "";
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function parseInlineArray(value) {
  const inner = value.slice(1, -1).trim();
  if (inner === "") return [];

  const items = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      const trimmed = current.trim();
      if (trimmed !== "") {
        items.push(parseScalar(trimmed));
      }
      current = "";
      continue;
    }
    current += char;
  }

  const finalItem = current.trim();
  if (finalItem !== "") {
    items.push(parseScalar(finalItem));
  }

  return items;
}

function getIndent(line) {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

function parseMultiline(lines, startIndex, baseIndent, mode) {
  const collected = [];
  let i = startIndex;
  let blockIndent = null;

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") {
      if (blockIndent !== null) {
        collected.push("");
      }
      continue;
    }
    const indent = getIndent(line);
    if (indent <= baseIndent) break;
    if (blockIndent === null) {
      blockIndent = indent;
    }
    collected.push(line.slice(blockIndent));
  }

  if (mode === ">") {
    return {
      value: collected.join(" ").replace(/\s+/g, " ").trim(),
      index: i,
    };
  }

  return { value: collected.join("\n"), index: i };
}

function parseBlock(lines, startIndex, indent) {
  const nextLine = lines[startIndex] || "";
  const trimmed = nextLine.trim();
  if (trimmed.startsWith("-")) {
    return parseList(lines, startIndex, indent);
  }
  return parseMapping(lines, startIndex, indent);
}

function parseMapping(lines, startIndex, indent) {
  const result = {};
  let i = startIndex;

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.trim().startsWith("#")) continue;

    const lineIndent = getIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) continue;

    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) break;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rest = trimmed.slice(colonIndex + 1).trim();

    if (rest === "|" || rest === ">") {
      const parsed = parseMultiline(lines, i + 1, lineIndent, rest);
      result[key] = parsed.value;
      i = parsed.index - 1;
      continue;
    }

    if (rest === "") {
      let nextIndex = i + 1;
      while (nextIndex < lines.length && lines[nextIndex].trim() === "") {
        nextIndex += 1;
      }
      if (nextIndex < lines.length) {
        const nextIndent = getIndent(lines[nextIndex]);
        if (nextIndent > lineIndent) {
          const parsed = parseBlock(lines, nextIndex, nextIndent);
          result[key] = parsed.value;
          i = parsed.index - 1;
          continue;
        }
      }
      result[key] = null;
      continue;
    }

    if (rest === "[]") {
      result[key] = [];
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      result[key] = parseInlineArray(rest);
      continue;
    }

    result[key] = parseScalar(rest);
  }

  return { value: result, index: i };
}

function parseInlineKeyValue(value) {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return null;
  const key = value.slice(0, colonIndex).trim();
  const rest = value.slice(colonIndex + 1).trim();
  if (!key) return null;
  return { key, rest };
}

function parseList(lines, startIndex, indent) {
  const result = [];
  let i = startIndex;

  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.trim().startsWith("#")) continue;

    const lineIndent = getIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) continue;

    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) break;

    const itemRest = trimmed.slice(2).trim();
    let itemValue = null;
    let nextIndex = i + 1;

    if (itemRest === "") {
      while (nextIndex < lines.length && lines[nextIndex].trim() === "") {
        nextIndex += 1;
      }
      if (nextIndex < lines.length) {
        const nextIndent = getIndent(lines[nextIndex]);
        if (nextIndent > lineIndent) {
          const parsed = parseBlock(lines, nextIndex, nextIndent);
          itemValue = parsed.value;
          nextIndex = parsed.index;
        }
      }
      result.push(itemValue);
      i = nextIndex - 1;
      continue;
    }

    const inlineMapping = parseInlineKeyValue(itemRest);
    if (inlineMapping) {
      const value =
        inlineMapping.rest === ""
          ? null
          : inlineMapping.rest === "[]"
            ? []
            : inlineMapping.rest.startsWith("[") && inlineMapping.rest.endsWith("]")
              ? parseInlineArray(inlineMapping.rest)
              : parseScalar(inlineMapping.rest);
      itemValue = { [inlineMapping.key]: value };
      if (inlineMapping.rest === "") {
        while (nextIndex < lines.length && lines[nextIndex].trim() === "") {
          nextIndex += 1;
        }
        if (nextIndex < lines.length) {
          const nextIndent = getIndent(lines[nextIndex]);
          if (nextIndent > lineIndent) {
            const parsed = parseMapping(lines, nextIndex, nextIndent);
            Object.assign(itemValue, parsed.value);
            nextIndex = parsed.index;
          }
        }
      } else {
        while (nextIndex < lines.length && lines[nextIndex].trim() === "") {
          nextIndex += 1;
        }
        if (nextIndex < lines.length) {
          const nextIndent = getIndent(lines[nextIndex]);
          if (nextIndent > lineIndent) {
            const parsed = parseMapping(lines, nextIndex, nextIndent);
            Object.assign(itemValue, parsed.value);
            nextIndex = parsed.index;
          }
        }
      }
      result.push(itemValue);
      i = nextIndex - 1;
      continue;
    }

    if (itemRest === "|" || itemRest === ">") {
      const parsed = parseMultiline(lines, i + 1, lineIndent, itemRest);
      itemValue = parsed.value;
      result.push(itemValue);
      i = parsed.index - 1;
      continue;
    }

    itemValue = parseScalar(itemRest);
    result.push(itemValue);
  }

  return { value: result, index: i };
}

export function parseFrontmatterBlock(frontmatter) {
  const lines = frontmatter.split("\n");
  const parsed = parseMapping(lines, 0, 0);
  return parsed.value;
}
