import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Pair, YAMLMap } from "yaml";

// Mirrors the structural and schema rules enforced by
// src-tauri/src/metadata.rs (front_matter_bounds / MalformedFrontMatter /
// UnsafeFrontMatter / inspect_note_properties / inspect_note_aliases) so
// the live editor warns about the same problems the backend already
// refuses to silently rewrite, or silently ignores on read. General
// type/shape linting for arbitrary user properties is a separate, later
// phase.

export type FrontmatterLintRule =
  | "malformed-delimiters"
  | "malformed-yaml"
  | "duplicate-key"
  | "invalid-root"
  | "invalid-property-shape"
  | "duplicate-list-item"
  | "empty-list-item";

// Keys inspect_note_properties (metadata.rs) reads as a single scalar
// string via unique_string_property; any other shape is silently treated
// as absent by the backend, so we warn instead of failing silently.
const KNOWN_SCALAR_KEYS = [
  "status",
  "type",
  "created_at",
  "updated_at",
  "archived_at",
] as const;

export type FrontmatterDiagnostic = {
  from: number;
  to: number;
  message: string;
  rule: FrontmatterLintRule;
};

type FrontMatterBounds = {
  bodyStart: number;
  bodyEnd: number;
  openingStart: number;
  openingEnd: number;
};

type FrontMatterScan =
  | { kind: "absent" }
  | { kind: "malformed"; from: number; to: number; reason: "opening" | "closing" }
  | { kind: "present"; bounds: FrontMatterBounds };

function scanFrontMatterBounds(content: string): FrontMatterScan {
  const bomLength = content.startsWith("﻿") ? 1 : 0;
  const body = content.slice(bomLength);

  let openingLength: number;
  if (body.startsWith("---\r\n")) {
    openingLength = 5;
  } else if (body.startsWith("---\n")) {
    openingLength = 4;
  } else if (body.startsWith("---")) {
    return {
      kind: "malformed",
      from: bomLength,
      to: bomLength + 3,
      reason: "opening",
    };
  } else {
    return { kind: "absent" };
  }

  const openingStart = bomLength;
  const openingEnd = bomLength + openingLength;
  let lineStart = openingEnd;

  while (lineStart <= content.length) {
    const newlineIndex = content.indexOf("\n", lineStart);
    const lineEnd = newlineIndex < 0 ? content.length : newlineIndex + 1;
    let line = content.slice(lineStart, lineEnd);
    if (line.endsWith("\n")) line = line.slice(0, -1);
    if (line.endsWith("\r")) line = line.slice(0, -1);

    if (line === "---" || line === "...") {
      return {
        kind: "present",
        bounds: {
          bodyStart: openingEnd,
          bodyEnd: lineStart,
          openingStart,
          openingEnd,
        },
      };
    }
    if (lineEnd === content.length) break;
    lineStart = lineEnd;
  }

  return {
    kind: "malformed",
    from: openingStart,
    to: openingEnd,
    reason: "closing",
  };
}

function cleanYamlErrorMessage(message: string): string {
  return message.replace(/ at line \d+, column \d+:[\s\S]*/, "").trim();
}

function isScalarString(value: unknown): boolean {
  return isScalar(value) && typeof value.value === "string";
}

function isValidAliasesValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (isScalar(value) && value.value === null) return true;
  if (isScalarString(value)) return true;
  return isSeq(value) && value.items.every((item) => isScalarString(item));
}

function diagnosticRangeForNode(
  node: unknown,
  bodyStart: number,
): { from: number; to: number } {
  const range =
    node && typeof node === "object" && "range" in node
      ? (node as { range?: [number, number, number] | null }).range
      : null;
  if (!range) return { from: bodyStart, to: bodyStart };
  return { from: bodyStart + range[0], to: bodyStart + range[1] };
}

function diagnosticRangeForPair(
  pair: Pair<unknown, unknown>,
  bodyStart: number,
): { from: number; to: number } {
  return diagnosticRangeForNode(pair.value ?? pair.key, bodyStart);
}

function checkKnownPropertyShapes(
  root: YAMLMap,
  bodyStart: number,
): FrontmatterDiagnostic[] {
  const diagnostics: FrontmatterDiagnostic[] = [];

  for (const pair of root.items as Pair<unknown, unknown>[]) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;
    const key = pair.key.value;
    const value = pair.value;
    const isEmpty =
      value === null ||
      value === undefined ||
      (isScalar(value) && value.value === null);
    if (isEmpty) continue;

    if ((KNOWN_SCALAR_KEYS as readonly string[]).includes(key)) {
      if (!isScalarString(value)) {
        diagnostics.push({
          ...diagnosticRangeForPair(pair, bodyStart),
          rule: "invalid-property-shape",
          message: `Anchored ignores \`${key}\` unless it's plain text — this value won't be picked up.`,
        });
      }
    } else if (key === "aliases" && !isValidAliasesValue(value)) {
      diagnostics.push({
        ...diagnosticRangeForPair(pair, bodyStart),
        rule: "invalid-property-shape",
        message:
          "Anchored ignores `aliases` unless it's plain text or a list of text values.",
      });
    }
  }

  return diagnostics;
}

// General, key-agnostic list hygiene: duplicate or blank entries in any
// list-shaped property, not just ones Anchored reads. Known scalar keys
// are skipped here since Phase 2's invalid-property-shape rule already
// owns flagging them as wrong-shaped entirely.
function checkListItemHygiene(
  root: YAMLMap,
  bodyStart: number,
): FrontmatterDiagnostic[] {
  const diagnostics: FrontmatterDiagnostic[] = [];

  for (const pair of root.items as Pair<unknown, unknown>[]) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;
    const key = pair.key.value;
    if ((KNOWN_SCALAR_KEYS as readonly string[]).includes(key)) continue;

    const value = pair.value;
    if (!isSeq(value)) continue;
    if (!value.items.every((item) => isScalarString(item))) continue;

    const seen = new Set<string>();
    for (const item of value.items) {
      const text = (item as { value: string }).value;
      if (text.length === 0) {
        diagnostics.push({
          ...diagnosticRangeForNode(item, bodyStart),
          rule: "empty-list-item",
          message:
            "This entry is blank — check for a stray comma or empty line.",
        });
      } else if (seen.has(text)) {
        diagnostics.push({
          ...diagnosticRangeForNode(item, bodyStart),
          rule: "duplicate-list-item",
          message: `\`${text}\` is repeated in this list.`,
        });
      } else {
        seen.add(text);
      }
    }
  }

  return diagnostics;
}

export function lintFrontmatter(documentText: string): FrontmatterDiagnostic[] {
  const scan = scanFrontMatterBounds(documentText);

  if (scan.kind === "absent") return [];

  if (scan.kind === "malformed") {
    return [
      {
        from: scan.from,
        to: scan.to,
        rule: "malformed-delimiters",
        message:
          scan.reason === "opening"
            ? "The opening `---` delimiter must be on its own line."
            : "Frontmatter is missing a closing `---` (or `...`) delimiter.",
      },
    ];
  }

  const { bounds } = scan;
  const yamlText = documentText.slice(bounds.bodyStart, bounds.bodyEnd);
  const parsed = parseDocument(yamlText, { uniqueKeys: true });
  const diagnostics: FrontmatterDiagnostic[] = [];

  for (const error of parsed.errors) {
    const [start, end] = error.pos;
    const rule =
      error.code === "DUPLICATE_KEY" ? "duplicate-key" : "malformed-yaml";
    let from = bounds.bodyStart + start;
    let to = Math.max(bounds.bodyStart + end, from + 1);

    if (rule === "duplicate-key") {
      // The parser only reports a single-character position for duplicate
      // keys; underline the whole key line instead so the warning is
      // actually visible in the editor.
      const lineStart = yamlText.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
      const newlineIndex = yamlText.indexOf("\n", start);
      const lineEnd = newlineIndex < 0 ? yamlText.length : newlineIndex;
      const line = yamlText.slice(lineStart, lineEnd);
      const leadingWhitespace = line.length - line.trimStart().length;
      from = bounds.bodyStart + lineStart + leadingWhitespace;
      to = bounds.bodyStart + lineEnd;
    }

    diagnostics.push({
      from,
      to,
      rule,
      message: cleanYamlErrorMessage(error.message),
    });
  }

  const root = parsed.contents;
  if (root !== null && root !== undefined && !isMap(root)) {
    diagnostics.push({
      from: bounds.bodyStart,
      to: bounds.bodyEnd,
      rule: "invalid-root",
      message:
        "Frontmatter must be a set of `key: value` pairs, not a plain list or value.",
    });
  } else if (isMap(root)) {
    diagnostics.push(...checkKnownPropertyShapes(root, bounds.bodyStart));
    diagnostics.push(...checkListItemHygiene(root, bounds.bodyStart));
  }

  return diagnostics;
}
