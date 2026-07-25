import { parseDocument } from "yaml";

// Mirrors the structural rules enforced by src-tauri/src/metadata.rs
// (front_matter_bounds / MalformedFrontMatter / UnsafeFrontMatter) so the
// live editor warns about the same problems the backend already refuses to
// silently rewrite. Only structural validity is checked here (Phase 1);
// Anchored's own schema (id/status/timestamps) and general type/shape
// linting are separate, later phases.

export type FrontmatterLintRule =
  | "malformed-delimiters"
  | "malformed-yaml"
  | "duplicate-key"
  | "invalid-root";

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
  if (root !== null && root !== undefined && root.constructor.name !== "YAMLMap") {
    diagnostics.push({
      from: bounds.bodyStart,
      to: bounds.bodyEnd,
      rule: "invalid-root",
      message:
        "Frontmatter must be a set of `key: value` pairs, not a plain list or value.",
    });
  }

  return diagnostics;
}
