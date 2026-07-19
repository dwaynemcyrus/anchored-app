import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import { buildVaultCollections } from "./collections";

function document(
  name: string,
  input: Partial<AnchoredDocument> = {},
): AnchoredDocument {
  return {
    aliases: [],
    body: "",
    folder: "Vault",
    id: `vault-path:${name}`,
    name,
    outgoingLinks: [],
    relativePath: name,
    tags: [],
    title: name.replace(/\.md$/i, ""),
    ...input,
  };
}

describe("vault collections", () => {
  it("places every item into one lifecycle or asset collection", () => {
    const collections = buildVaultCollections([
      document("Missing.md"),
      document("Blank.md", { status: " " }),
      document("Inbox.md", { status: "INBOX" }),
      document("Active.md", { status: "active" }),
      document("Archived.md", { status: "archived" }),
      document("Photo.jpg", { isMarkdown: false }),
    ]);

    expect(collections.inbox.map((item) => item.name)).toEqual([
      "Blank.md",
      "Inbox.md",
      "Missing.md",
    ]);
    expect(collections.workbench.map((item) => item.name)).toEqual([
      "Active.md",
    ]);
    expect(collections.archive.map((item) => item.name)).toEqual([
      "Archived.md",
    ]);
    expect(collections.assets.map((item) => item.name)).toEqual(["Photo.jpg"]);
  });

  it("orders Untyped first and every actual Workbench type alphabetically", () => {
    const groups = buildVaultCollections([
      document("Project.md", { noteType: "Project", status: "active" }),
      document("Article.md", { noteType: "Article", status: "active" }),
      document("Zettel.md", { noteType: "Zettel", status: "active" }),
      document("Untyped.md", { status: "active" }),
    ]).workbenchGroups;

    expect(groups.map((group) => group.name)).toEqual([
      "Untyped",
      "Article",
      "Project",
      "Zettel",
    ]);
  });

  it("groups non-Markdown assets by recognized file type", () => {
    const groups = buildVaultCollections([
      document("Cover.jpg", { isMarkdown: false }),
      document("Diagram.png", { isMarkdown: false }),
      document("Guide.pdf", { isMarkdown: false }),
    ]).assetGroups;

    expect(groups.map((group) => [group.name, group.documents.length])).toEqual(
      [
        ["Image", 2],
        ["Pdf", 1],
      ],
    );
  });

  it("classifies and groups a large vault without quadratic work", () => {
    const documents = Array.from({ length: 700 }, (_, index) =>
      document(`Folder ${index % 56}/Note ${index}.md`, {
        noteType: index % 7 === 0 ? undefined : `Type ${index % 12}`,
        status: index % 10 === 0 ? "archived" : "active",
      }),
    );
    buildVaultCollections(documents);
    const samples = Array.from({ length: 5 }, () => {
      const start = performance.now();
      const result = buildVaultCollections(documents);
      return { elapsed: performance.now() - start, result };
    });
    const fastest = samples.reduce((left, right) =>
      left.elapsed <= right.elapsed ? left : right,
    );
    const collections = fastest.result;

    expect(
      collections.inbox.length +
        collections.workbench.length +
        collections.archive.length,
    ).toBe(700);
    expect(collections.workbenchGroups[0]?.name).toBe("Untyped");
    expect(fastest.elapsed).toBeLessThan(100);
  });
});
