import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import {
  documentsForScope,
  isSameScope,
  scopeLabel,
  sortNotes,
} from "./noteListScope";

function note(overrides: Partial<AnchoredDocument>): AnchoredDocument {
  return {
    aliases: [],
    body: "",
    folder: "inbox",
    folderPath: "inbox",
    id: overrides.name ?? "note",
    name: "Note.md",
    outgoingLinks: [],
    tags: [],
    title: "Note",
    ...overrides,
  };
}

describe("scope labels", () => {
  it("names a collection", () => {
    expect(
      scopeLabel({ kind: "collection", id: "workbench" }, "Personal"),
    ).toBe("Workbench");
  });

  it("names a folder by its last segment", () => {
    expect(scopeLabel({ kind: "folder", path: "a/b/notes" }, "Personal")).toBe(
      "notes",
    );
  });

  it("names the vault at the tree root", () => {
    expect(scopeLabel({ kind: "folder", path: "" }, "Personal")).toBe(
      "Personal",
    );
  });
});

describe("isSameScope", () => {
  it("compares collections and folders separately", () => {
    expect(
      isSameScope(
        { kind: "collection", id: "inbox" },
        { kind: "collection", id: "inbox" },
      ),
    ).toBe(true);
    expect(
      isSameScope(
        { kind: "collection", id: "inbox" },
        { kind: "collection", id: "archive" },
      ),
    ).toBe(false);
    expect(
      isSameScope({ kind: "folder", path: "a" }, { kind: "folder", path: "a" }),
    ).toBe(true);
    expect(
      isSameScope(
        { kind: "folder", path: "a" },
        { kind: "collection", id: "inbox" },
      ),
    ).toBe(false);
  });
});

describe("documentsForScope", () => {
  const documents = [
    note({ name: "One.md", folderPath: "inbox", status: "inbox" }),
    note({ name: "Two.md", folderPath: "inbox/deep", status: "inbox" }),
    note({ name: "Three.md", folderPath: "", status: "inbox" }),
  ];

  it("lists a folder's own notes without descending into subfolders", () => {
    expect(
      documentsForScope(documents, { kind: "folder", path: "inbox" }).map(
        (document) => document.name,
      ),
    ).toEqual(["One.md"]);
  });

  it("lists the vault root as an empty folder path", () => {
    expect(
      documentsForScope(documents, { kind: "folder", path: "" }).map(
        (document) => document.name,
      ),
    ).toEqual(["Three.md"]);
  });

  it("omits recovery copies from a folder scope", () => {
    const withRecovery = [
      ...documents,
      note({ name: "Recovered.md", folderPath: "inbox", isRecoveryCopy: true }),
    ];

    expect(
      documentsForScope(withRecovery, { kind: "folder", path: "inbox" }).map(
        (document) => document.name,
      ),
    ).toEqual(["One.md"]);
  });

  it("delegates a collection scope to the shared collection rules", () => {
    const listed = documentsForScope(documents, {
      kind: "collection",
      id: "inbox",
    });

    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((document) => document.isRecoveryCopy !== true)).toBe(
      true,
    );
  });
});

describe("sortNotes", () => {
  const documents = [
    note({ name: "b.md", modifiedMillis: 200, createdAt: "2026-01-02" }),
    note({ name: "a.md", modifiedMillis: 300, createdAt: "2026-01-03" }),
    note({ name: "c.md", modifiedMillis: 100, createdAt: "2026-01-01" }),
  ];

  it("sorts by name in both directions", () => {
    expect(sortNotes(documents, "name-asc").map((d) => d.name)).toEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
    expect(sortNotes(documents, "name-desc").map((d) => d.name)).toEqual([
      "c.md",
      "b.md",
      "a.md",
    ]);
  });

  it("sorts by modified time, newest first by default", () => {
    expect(sortNotes(documents, "modified-desc").map((d) => d.name)).toEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
    expect(sortNotes(documents, "modified-asc").map((d) => d.name)).toEqual([
      "c.md",
      "b.md",
      "a.md",
    ]);
  });

  it("sorts by creation date", () => {
    expect(sortNotes(documents, "created-desc").map((d) => d.name)).toEqual([
      "a.md",
      "b.md",
      "c.md",
    ]);
  });

  it("sorts notes without a creation date last in either direction", () => {
    const mixed = [
      note({ name: "dated.md", createdAt: "2026-01-01" }),
      note({ name: "undated.md" }),
    ];

    expect(sortNotes(mixed, "created-desc").map((d) => d.name)).toEqual([
      "dated.md",
      "undated.md",
    ]);
    expect(sortNotes(mixed, "created-asc").map((d) => d.name)).toEqual([
      "dated.md",
      "undated.md",
    ]);
  });

  it("does not mutate the documents it is given", () => {
    const original = [...documents];
    sortNotes(documents, "name-asc");
    expect(documents).toEqual(original);
  });
});
