import { describe, expect, it } from "vitest";

import type { VaultSnapshot } from "../lib/tauri/vault";
import { documentsFromVault, mergeDocumentsFromVault } from "./documents";

const warnings = {
  addedIdentities: 0,
  identityConflicts: 0,
  needsIdentity: 0,
  skippedNonUtf8Paths: 0,
  skippedSymlinks: 0,
};

describe("vault documents", () => {
  it("indexes an identified note by stable ID and Obsidian aliases", () => {
    const snapshot: VaultSnapshot = {
      files: [
        {
          aliases: ["Leading Well"],
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    };

    expect(documentsFromVault(snapshot)[0]).toMatchObject({
      aliases: ["Leading Well"],
      id: "vault-id:01JZQ7K8P4A6F2M9V3C5T7X1BY",
      relativePath: "Notes/Leadership.md",
    });
  });

  it("retains local edits when an identified note moves or is renamed", () => {
    const original: VaultSnapshot = {
      files: [
        {
          aliases: ["Old alias"],
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "Before.md",
          parent: "Notes",
          relativePath: "Notes/Before.md",
        },
      ],
      name: "Personal",
      warnings,
    };
    const current = documentsFromVault(original).map((document) => ({
      ...document,
      saveState: "unsaved" as const,
      sourceText: "Local edit",
    }));
    const renamed: VaultSnapshot = {
      files: [
        {
          aliases: ["New alias"],
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "After.md",
          parent: "Archive",
          relativePath: "Archive/After.md",
        },
      ],
      name: "Personal",
      warnings,
    };

    const merged = mergeDocumentsFromVault(current, renamed);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      aliases: ["New alias"],
      id: "vault-id:01JZQ7K8P4A6F2M9V3C5T7X1BY",
      name: "After.md",
      relativePath: "Archive/After.md",
      saveState: "unsaved",
      sourceText: "Local edit",
    });
  });
});
