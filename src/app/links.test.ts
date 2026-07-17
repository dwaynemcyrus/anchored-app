import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import {
  backlinksForDocument,
  resolveWikilink,
  wikilinkAtOffset,
  wikilinkCompletionAtOffset,
  wikilinksInContent,
} from "./links";

const documents: AnchoredDocument[] = [
  {
    aliases: ["Leading Well"],
    body: "",
    folder: "Notes",
    id: "leadership",
    name: "Leadership.md",
    outgoingLinks: [],
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
    outgoingLinks: [],
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
    outgoingLinks: [],
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

  it("includes quoted property links and ignores code or escaped body links", () => {
    const content = [
      "---",
      "related: '[[Front matter]]'",
      'references: ["[[List property|Shown property]]"]',
      "---",
      "\\[[Escaped]] and `[[Inline code]]`",
      "```md",
      "[[Fenced code]]",
      "```",
      "    [[Indented code]]",
      "[[Real note|Shown label]]",
    ].join("\n");

    expect(wikilinksInContent(content)).toMatchObject([
      { label: "Front matter", target: "Front matter" },
      { label: "Shown property", target: "List property" },
      { label: "Shown label", target: "Real note" },
    ]);
    expect(
      wikilinkAtOffset(content, content.indexOf("Front matter") + 2),
    ).toMatchObject({ target: "Front matter" });
  });

  it("finds open link completion in body and quoted front matter", () => {
    const body = "See [[Lea";
    expect(wikilinkCompletionAtOffset(body, body.length)).toEqual({
      from: 6,
      query: "Lea",
    });

    const property = '---\nrelated: "[[Reading N"\n---\nBody';
    const propertyOffset = property.indexOf('"\n---');
    expect(wikilinkCompletionAtOffset(property, propertyOffset)).toEqual({
      from: property.indexOf("[[") + 2,
      query: "Reading N",
    });
  });

  it("preserves offsets across CRLF and a final unterminated line", () => {
    const content = "First\r\n[[Second]]\r\nLast [[Third]]";

    expect(wikilinksInContent(content)).toMatchObject([
      { start: content.indexOf("[[Second]]"), target: "Second" },
      { start: content.indexOf("[[Third]]"), target: "Third" },
    ]);
    const completion = "First\r\n[[Thi";
    expect(wikilinkCompletionAtOffset(completion, completion.length)).toEqual({
      from: 9,
      query: "Thi",
    });
  });

  it("refuses completion in code, comments, malformed links, or YAML text", () => {
    const cases = [
      "`[[Code",
      "    [[Indented",
      "```md\n[[Fenced",
      "\\[[Escaped",
      "[[Label|Display",
      "---\nplain: [[Not quoted",
      '---\n# "[[Commented',
    ];

    for (const content of cases) {
      expect(wikilinkCompletionAtOffset(content, content.length)).toBeNull();
    }
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

  it("builds backlinks only from unique resolved targets", () => {
    const linkedDocuments = documents.map((document) => ({ ...document }));
    linkedDocuments[0].outgoingLinks = ["Reading Notes", "Unknown"];
    linkedDocuments[1].outgoingLinks = ["Reading Notes"];
    linkedDocuments[2].sourceText = "[[Leading Well]] and [[Leadership]]";

    expect(
      backlinksForDocument(linkedDocuments, "reading").map(
        (document) => document.id,
      ),
    ).toEqual(["leadership", "archived-leadership"]);
    expect(
      backlinksForDocument(linkedDocuments, "leadership").map(
        (document) => document.id,
      ),
    ).toEqual(["reading"]);
  });
});
