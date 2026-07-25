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

  describe("known property shapes (Anchored schema)", () => {
    it.each(["status", "type", "created_at", "updated_at", "archived_at"])(
      "flags a non-scalar value for %s",
      (key) => {
        const source = ["---", `${key}: [archived]`, "---", "Body"].join("\n");
        const diagnostics = lintFrontmatter(source);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].rule).toBe("invalid-property-shape");
        expect(diagnostics[0].message).toContain(`\`${key}\``);
      },
    );

    it.each(["status", "type", "created_at", "updated_at", "archived_at"])(
      "accepts a plain string value for %s",
      (key) => {
        const source = ["---", `${key}: active`, "---", "Body"].join("\n");
        expect(lintFrontmatter(source)).toEqual([]);
      },
    );

    it.each(["status", "type", "created_at", "updated_at", "archived_at"])(
      "leaves an empty value for %s alone",
      (key) => {
        const source = ["---", `${key}:`, "---", "Body"].join("\n");
        expect(lintFrontmatter(source)).toEqual([]);
      },
    );

    it("flags a mapping value for a known scalar key", () => {
      const source = [
        "---",
        "status:",
        "  nested: archived",
        "---",
        "Body",
      ].join("\n");
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("invalid-property-shape");
    });

    it("accepts a plain string alias", () => {
      const source = ["---", "aliases: Alt Name", "---", "Body"].join("\n");
      expect(lintFrontmatter(source)).toEqual([]);
    });

    it("accepts a list of string aliases", () => {
      const source = [
        "---",
        "aliases:",
        "  - Alt Name",
        "  - Other",
        "---",
        "Body",
      ].join("\n");
      expect(lintFrontmatter(source)).toEqual([]);
    });

    it("leaves an empty aliases value alone", () => {
      const source = ["---", "aliases:", "---", "Body"].join("\n");
      expect(lintFrontmatter(source)).toEqual([]);
    });

    it("flags a list of aliases containing a non-string item", () => {
      const source = [
        "---",
        "aliases:",
        "  - Alt Name",
        "  - 42",
        "---",
        "Body",
      ].join("\n");
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("invalid-property-shape");
      expect(diagnostics[0].message).toContain("`aliases`");
    });

    it("flags a mapping value for aliases", () => {
      const source = [
        "---",
        "aliases:",
        "  primary: Alt Name",
        "---",
        "Body",
      ].join("\n");
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("invalid-property-shape");
    });

    it("does not flag unrelated custom properties", () => {
      const source = ["---", "tags: [a, b]", "custom: 42", "---", "Body"].join(
        "\n",
      );
      expect(lintFrontmatter(source)).toEqual([]);
    });
  });

  describe("list item hygiene (schema-agnostic)", () => {
    it("flags a duplicate string item in a list", () => {
      const source = ["---", "aliases: [Foo, Bar, Foo]", "---", "Body"].join(
        "\n",
      );
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("duplicate-list-item");
      expect(diagnostics[0].message).toContain("Foo");
    });

    it("flags a blank string item in a list", () => {
      const source = ["---", 'aliases: [Foo, "", Bar]', "---", "Body"].join(
        "\n",
      );
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("empty-list-item");
    });

    it("flags both a duplicate and a blank item in the same list", () => {
      const source = ["---", 'aliases: [Foo, "", Foo]', "---", "Body"].join(
        "\n",
      );
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.map((d) => d.rule).sort()).toEqual([
        "duplicate-list-item",
        "empty-list-item",
      ]);
    });

    it("does not flag a clean list", () => {
      const source = ["---", "aliases: [Foo, Bar, Baz]", "---", "Body"].join(
        "\n",
      );
      expect(lintFrontmatter(source)).toEqual([]);
    });

    it("applies to arbitrary custom list properties, not just aliases", () => {
      const source = ["---", "related: [Foo, Foo]", "---", "Body"].join("\n");
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("duplicate-list-item");
    });

    it("skips list hygiene for known scalar keys, deferring to the shape rule", () => {
      const source = ["---", "status: [a, a]", "---", "Body"].join("\n");
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("invalid-property-shape");
    });

    it("skips hygiene checks on a list that already has a shape problem", () => {
      const source = ["---", "aliases: [Foo, Foo, 42]", "---", "Body"].join(
        "\n",
      );
      const diagnostics = lintFrontmatter(source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].rule).toBe("invalid-property-shape");
    });
  });
});
