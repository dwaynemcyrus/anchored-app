import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import { buildWikilinkCandidates } from "./linkCandidates";
import { rankQuickOpenResults } from "./retrieval";

function note(
  id: string,
  relativePath: string,
  aliases: string[] = [],
): AnchoredDocument {
  const parts = relativePath.split("/");
  const name = parts.pop() as string;
  return {
    aliases,
    body: "",
    folder: parts.join("/") || "Vault",
    id,
    name,
    outgoingLinks: [],
    relativePath,
    tags: [],
    title: name.replace(/\.md$/i, ""),
  };
}

describe("quick open retrieval", () => {
  it("shows recent notes by default and excludes the active note", () => {
    const documents = [
      note("active", "Notes/Active.md"),
      note("recent", "Writing/Recent.md"),
      note("older", "Notes/Older.md"),
    ];
    const candidates = buildWikilinkCandidates(
      documents,
      new Map([
        ["active", { firstSeenAt: 1, lastActiveAt: 30 }],
        ["recent", { firstSeenAt: 2, lastActiveAt: 20 }],
        ["older", { firstSeenAt: 3, lastActiveAt: 10 }],
      ]),
    );

    expect(
      rankQuickOpenResults(candidates, documents, "", "active").map(
        (result) => result.label,
      ),
    ).toEqual(["Recent", "Older"]);
  });

  it("matches aliases but returns each note only once", () => {
    const documents = [
      note("one", "Notes/Leadership.md", ["Leading Well", "Lead"]),
      note("two", "Notes/Field Notes.md"),
    ];
    const candidates = buildWikilinkCandidates(documents, new Map());

    expect(rankQuickOpenResults(candidates, documents, "lead")).toEqual([
      {
        detail: "Notes/Leadership.md",
        documentId: "one",
        label: "Leadership",
        matchedAlias: "Lead",
      },
    ]);
  });

  it("drops placeholders and stale candidate identifiers", () => {
    const documents = [note("one", "Notes/Source.md")];
    documents[0].outgoingLinks = ["Future Note"];
    const candidates = buildWikilinkCandidates(documents, new Map());
    candidates.unshift({
      activityAt: 100,
      detail: "Missing",
      documentId: "stale",
      kind: "note",
      label: "Stale",
      target: "Stale",
    });

    expect(rankQuickOpenResults(candidates, documents, "future")).toEqual([]);
    expect(rankQuickOpenResults(candidates, documents, "stale")).toEqual([]);
  });
});
