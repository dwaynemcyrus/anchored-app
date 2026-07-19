import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import { buildDocumentLinkIndex } from "./links";
import {
  buildWikilinkCandidates,
  rankWikilinkCandidates,
  shortestWikilinkTarget,
  type DocumentActivity,
} from "./linkCandidates";

function note(
  id: string,
  relativePath: string,
  aliases: string[] = [],
  outgoingLinks: string[] = [],
): AnchoredDocument {
  const parts = relativePath.split("/");
  const name = parts.pop() as string;
  return {
    aliases,
    body: "",
    folder: parts.join("/") || "Vault",
    id,
    name,
    outgoingLinks,
    relativePath,
    tags: [],
    title: name.replace(/\.md$/i, ""),
  };
}

describe("wikilink candidates", () => {
  it("uses a filename when unique and a vault path for duplicates", () => {
    const documents = [
      note("one", "Notes/Project.md"),
      note("two", "Archive/Project.md"),
      note("three", "Writing/Essay.md"),
    ];

    expect(shortestWikilinkTarget(documents[2], documents)).toBe("Essay");
    expect(shortestWikilinkTarget(documents[0], documents)).toBe(
      "Notes/Project",
    );
    expect(shortestWikilinkTarget(documents[1], documents)).toBe(
      "Archive/Project",
    );
  });

  it("builds safe filename, alias, and deduplicated placeholder candidates", () => {
    const documents = [
      note(
        "leadership",
        "Notes/Leadership.md",
        ["Leading Well", "Leadership", "Unsafe|Alias"],
        ["Future Idea", "Future Idea#Next"],
      ),
      note("reading", "Reading.md", [], ["Future Idea", "Leadership"]),
      note("draft", "Unsafe#Name.md"),
    ];
    const activity = new Map<string, DocumentActivity>([
      ["leadership", { firstSeenAt: 10, lastActiveAt: 20 }],
    ]);

    expect(buildWikilinkCandidates(documents, activity)).toEqual([
      {
        activityAt: 20,
        detail: "Notes",
        documentId: "leadership",
        kind: "note",
        label: "Leadership",
        target: "Leadership",
      },
      {
        activityAt: 20,
        detail: "Alias · Notes",
        documentId: "leadership",
        kind: "alias",
        label: "Leading Well",
        target: "Leadership|Leading Well",
      },
      {
        activityAt: 0,
        detail: "Vault root",
        documentId: "reading",
        kind: "note",
        label: "Reading",
        target: "Reading",
      },
      {
        activityAt: 0,
        detail: "Uncreated · 2 references",
        kind: "unresolved",
        label: "Future Idea",
        referenceCount: 2,
        target: "Future Idea",
      },
    ]);
  });

  it("uses live source text when collecting unresolved placeholders", () => {
    const source = note("source", "Source.md", [], ["Stale"]);
    source.sourceText = "[[Fresh]] and `[[Ignored]]`";

    expect(
      buildWikilinkCandidates([source], new Map()).filter(
        (candidate) => candidate.kind === "unresolved",
      ),
    ).toMatchObject([{ label: "Fresh", referenceCount: 1 }]);
  });

  it("shows recent notes by default and ranks resolved matches before placeholders", () => {
    const candidates = buildWikilinkCandidates(
      [
        note("active", "Notes/Active.md", ["Current"], ["Act Later"]),
        note("recent", "Notes/Action.md", ["Act now"]),
        note("older", "Notes/Archive.md"),
      ],
      new Map([
        ["active", { firstSeenAt: 1, lastActiveAt: 30 }],
        ["recent", { firstSeenAt: 2, lastActiveAt: 20 }],
        ["older", { firstSeenAt: 3, lastActiveAt: 10 }],
      ]),
    );

    expect(
      rankWikilinkCandidates(candidates, "", "active").map(
        (candidate) => candidate.label,
      ),
    ).toEqual(["Action", "Archive"]);
    expect(
      rankWikilinkCandidates(candidates, "act").map((candidate) => [
        candidate.kind,
        candidate.label,
      ]),
    ).toEqual([
      ["note", "Active"],
      ["note", "Action"],
      ["alias", "Act now"],
      ["unresolved", "Act Later"],
      ["unresolved", "act"],
    ]);
  });

  it("matches word prefixes, substrings, and conservative subsequences", () => {
    const candidates = buildWikilinkCandidates(
      [
        note("one", "Notes/Reading List.md"),
        note("two", "Notes/Field Research.md"),
        note("three", "Notes/Leadership.md"),
      ],
      new Map(),
    );

    expect(rankWikilinkCandidates(candidates, "list")[0].label).toBe(
      "Reading List",
    );
    expect(rankWikilinkCandidates(candidates, "research")[0].label).toBe(
      "Field Research",
    );
    expect(rankWikilinkCandidates(candidates, "ldshp")[0].label).toBe(
      "Leadership",
    );
  });

  it("bounds large candidate sets deterministically", () => {
    const documents = Array.from({ length: 100 }, (_, index) =>
      note(`note-${index}`, `Notes/Note ${String(index).padStart(3, "0")}.md`),
    );
    const candidates = buildWikilinkCandidates(documents, new Map());

    const ranked = rankWikilinkCandidates(candidates, "note", undefined, 12);
    expect(ranked).toHaveLength(12);
    expect(ranked[0].label).toBe("Note 000");
    expect(ranked[10].label).toBe("Note 010");
    expect(ranked[11].detail).toBe("New uncreated link");
  });

  it("offers typed text as a placeholder only when no exact target exists", () => {
    const candidates = buildWikilinkCandidates(
      [note("one", "Notes/Leadership.md")],
      new Map(),
    );

    expect(rankWikilinkCandidates(candidates, "Leadership")).toHaveLength(1);
    expect(
      rankWikilinkCandidates(candidates, "Future idea").slice(-1)[0],
    ).toEqual({
      activityAt: 0,
      detail: "New uncreated link",
      kind: "unresolved",
      label: "Future idea",
      referenceCount: 0,
      target: "Future idea",
    });
    expect(rankWikilinkCandidates(candidates, "Unsafe|link")).toEqual([]);
  });

  it("builds 700-note link topology without quadratic scans", () => {
    const documents = Array.from({ length: 700 }, (_, index) =>
      note(
        `note-${index}`,
        `Folder ${String(index % 56).padStart(2, "0")}/Note ${String(index).padStart(4, "0")}.md`,
        index % 20 === 0 ? [`Alias ${index}`] : [],
        Array.from(
          { length: 5 },
          (_, offset) =>
            `Note ${String((index + offset + 1) % 700).padStart(4, "0")}`,
        ),
      ),
    );

    const started = performance.now();
    const index = buildDocumentLinkIndex(documents);
    const candidates = buildWikilinkCandidates(documents, new Map(), index);
    const duration = performance.now() - started;

    expect(
      candidates.filter((candidate) => candidate.kind === "note"),
    ).toHaveLength(700);
    expect(duration).toBeLessThan(100);
  });
});
