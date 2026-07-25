import { describe, expect, it } from "vitest";

import { lintFrontmatter } from "./frontmatterLint";

describe("lintFrontmatter", () => {
  it("returns no diagnostics when there is no frontmatter", () => {
    expect(lintFrontmatter("Just a note with no frontmatter.")).toEqual([]);
  });

  it("returns no diagnostics for valid frontmatter", () => {
    const source = ["---", "id: 1", "tags: [a, b]", "---", "", "Body"].join(
      "\n",
    );
    expect(lintFrontmatter(source)).toEqual([]);
  });

  it("returns no diagnostics for empty frontmatter", () => {
    const source = ["---", "---", "", "Body"].join("\n");
    expect(lintFrontmatter(source)).toEqual([]);
  });

  it("flags a malformed opening delimiter", () => {
    const source = ["---oops", "id: 1", "---", "Body"].join("\n");
    const diagnostics = lintFrontmatter(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].rule).toBe("malformed-delimiters");
    expect(diagnostics[0].message).toMatch(/opening/i);
  });

  it("flags a missing closing delimiter", () => {
    const source = ["---", "id: 1", "", "Body with no closing fence"].join(
      "\n",
    );
    const diagnostics = lintFrontmatter(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].rule).toBe("malformed-delimiters");
    expect(diagnostics[0].message).toMatch(/closing/i);
  });

  it("flags duplicate top-level keys", () => {
    const source = ["---", "id: 1", "id: 2", "---", "Body"].join("\n");
    const diagnostics = lintFrontmatter(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].rule).toBe("duplicate-key");
    const [from, to] = [diagnostics[0].from, diagnostics[0].to];
    expect(source.slice(from, to)).toBe("id: 2");
  });

  it("flags malformed YAML syntax", () => {
    const source = ["---", "id: 1", "  bad: [1,2", "---", "Body"].join("\n");
    const diagnostics = lintFrontmatter(source);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.rule === "malformed-yaml")).toBe(true);
  });

  it("flags a sequence root as invalid", () => {
    const source = ["---", "- a", "- b", "---", "Body"].join("\n");
    const diagnostics = lintFrontmatter(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].rule).toBe("invalid-root");
  });

  it("flags a scalar root as invalid", () => {
    const source = ["---", "just a scalar", "---", "Body"].join("\n");
    const diagnostics = lintFrontmatter(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].rule).toBe("invalid-root");
  });

  it("accepts a UTF-8 BOM before the opening delimiter", () => {
    const source = "﻿" + ["---", "id: 1", "---", "Body"].join("\n");
    expect(lintFrontmatter(source)).toEqual([]);
  });

  it("keeps diagnostic ranges within the document bounds", () => {
    const source = ["---", "id: 1", "id: 2", "---", "Body"].join("\n");
    const diagnostics = lintFrontmatter(source);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.from).toBeGreaterThanOrEqual(0);
      expect(diagnostic.to).toBeLessThanOrEqual(source.length);
      expect(diagnostic.from).toBeLessThanOrEqual(diagnostic.to);
    }
  });
});
