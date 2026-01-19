/**
 * YAML Frontmatter Parser & Serializer
 *
 * Minimal implementation for backup/restore.
 * Handles the subset of YAML needed for note metadata.
 */

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Extract YAML frontmatter and body from a markdown string.
 *
 * @param {string} mdString
 * @returns {{ meta: Record<string, any>, body: string }}
 */
export function extractFrontmatter(mdString) {
  if (typeof mdString !== "string") {
    return { meta: {}, body: "" };
  }

  const match = mdString.match(FRONTMATTER_REGEX);
  if (!match) {
    return { meta: {}, body: mdString };
  }

  const yamlBlock = match[1];
  const body = mdString.slice(match[0].length);

  const meta = parseSimpleYaml(yamlBlock);
  return { meta, body };
}

/**
 * Parse a simple YAML block (key: value pairs only).
 * Does not support nested objects, arrays, or complex YAML features.
 *
 * @param {string} yamlString
 * @returns {Record<string, any>}
 */
function parseSimpleYaml(yamlString) {
  const result = {};
  const lines = yamlString.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    if (key === "") {
      continue;
    }

    // Parse value
    result[key] = parseYamlValue(value);
  }

  return result;
}

/**
 * Parse a simple YAML value.
 *
 * @param {string} value
 * @returns {any}
 */
function parseYamlValue(value) {
  // Null
  if (value === "null" || value === "~" || value === "") {
    return null;
  }

  // Boolean
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Number
  const num = Number(value);
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(value)) {
    return num;
  }

  // Default: string
  return value;
}

/**
 * Serialize metadata to YAML frontmatter block.
 *
 * @param {Record<string, any>} meta
 * @returns {string} - YAML block with --- delimiters
 */
export function serializeFrontmatter(meta) {
  if (!meta || typeof meta !== "object" || Object.keys(meta).length === 0) {
    return "";
  }

  const lines = ["---"];

  for (const [key, value] of Object.entries(meta)) {
    lines.push(`${key}: ${serializeYamlValue(value)}`);
  }

  lines.push("---");
  return lines.join("\n") + "\n";
}

/**
 * Serialize a value for YAML.
 *
 * @param {any} value
 * @returns {string}
 */
function serializeYamlValue(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    // Quote strings that might be ambiguous
    if (value === "" ||
        value === "null" ||
        value === "true" ||
        value === "false" ||
        value.includes(":") ||
        value.includes("#") ||
        value.includes("\n") ||
        /^[\d.-]/.test(value)) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  // Fallback for other types
  return JSON.stringify(value);
}
