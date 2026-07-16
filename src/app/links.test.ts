import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import { resolveWikilink, wikilinkAtOffset } from "./links";

const documents: AnchoredDocument[] = [
  {
    aliases: ["Leading Well"],
    body: "",
    folder: "Notes",
    id: "leadership",
    name: "Leadership.md",
    relativePath: "Notes/Leadership.md",
    tags: [],
    title: "Leadership",
  },
  {
    aliases: ["Shared"],
    body: "",
    folder: "Archive",
    id: "archived-leadership",
    name: "Leadership.md",
    relativePath: "Archive/Leadership.md",
    tags: [],
    title: "Leadership",
  },
  {
    aliases: ["Shared"],
    body: "",
    folder: "Notes",
    id: "reading",
    name: "Reading Notes.md",
    relativePath: "Notes/Reading Notes.md",
    tags: [],
    title: "Reading Notes",
  },
];

describe("wikilinks", () => {
  it("parses targets, headings, aliases, and embeds at the cursor", () => {
    const content = "See ![[Notes/Leadership#Habits|Leading habits]] today.";
    const offset = content.indexOf("Leadership") + 2;

    expect(wikilinkAtOffset(content, offset)).toMatchObject({
      label: "Leading habits",
      target: "Notes/Leadership#Habits",
    });
    expect(wikilinkAtOffset(content, 0)).toBeNull();
  });

  it("prefers an exact path and supports headings and extensions", () => {
    expect(
      resolveWikilink("Notes/Leadership.md#Habits", documents, "reading"),
    ).toEqual({ status: "resolved", documentId: "leadership" });
  });

  it("resolves aliases case-insensitively", () => {
    expect(resolveWikilink("leading well", documents, "reading")).toEqual({
      status: "resolved",
      documentId: "leadership",
    });
  });

  it("reports duplicate filenames and aliases as ambiguous", () => {
    expect(resolveWikilink("Leadership", documents, "reading")).toEqual({
      status: "ambiguous",
      matches: ["leadership", "archived-leadership"],
    });
    expect(resolveWikilink("Shared", documents, "reading")).toEqual({
      status: "ambiguous",
      matches: ["archived-leadership", "reading"],
    });
  });

  it("resolves same-note headings and reports missing notes", () => {
    expect(resolveWikilink("#Next", documents, "reading")).toEqual({
      status: "resolved",
      documentId: "reading",
    });
    expect(resolveWikilink("Unknown", documents, "reading")).toEqual({
      status: "missing",
    });
  });
});
