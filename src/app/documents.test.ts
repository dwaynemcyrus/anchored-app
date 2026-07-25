import { describe, expect, it } from "vitest";

import type { VaultSnapshot } from "../lib/tauri/vault";
import {
  applyVaultPatch,
  documentsFromVault,
  folderDisplayName,
  folderName,
  mergeDocumentsFromVault,
  mergeFolderPaths,
  newNoteFilename,
} from "./documents";

const warnings = {
  skippedNonUtf8Paths: 0,
  skippedSymlinks: 0,
};

describe("vault documents", () => {
  it("formats new note filenames as UTC timestamps with milliseconds", () => {
    expect(newNoteFilename(new Date("2026-02-19T23:35:41.123Z"))).toBe(
      "20260219233541123.md",
    );
  });

  it("indexes a note by path and keeps Obsidian aliases", () => {
    const snapshot: VaultSnapshot = {
      files: [
        {
          aliases: ["Leading Well"],
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
      id: "vault-path:Notes/Leadership.md",
      relativePath: "Notes/Leadership.md",
    });
  });

  it("carries a note's stable identity from the backend into noteId", () => {
    const snapshot: VaultSnapshot = {
      files: [
        {
          identity: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    };

    expect(documentsFromVault(snapshot)[0]).toMatchObject({
      id: "vault-path:Notes/Leadership.md",
      noteId: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
    });
  });

  it("keeps a note's stable id even when a rescan omits it", () => {
    const withId = documentsFromVault({
      files: [
        {
          identity: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    });

    // A rescan pass that doesn't report an identity (e.g. a transient read)
    // must never drop a previously seen one.
    const rescanned = mergeDocumentsFromVault(withId, {
      files: [
        {
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    });

    expect(rescanned[0]).toMatchObject({
      noteId: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
    });
  });

  it("retains local edits when indexed metadata refreshes", () => {
    const original: VaultSnapshot = {
      files: [
        {
          aliases: ["Old alias"],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
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
    const refreshed: VaultSnapshot = {
      files: [
        {
          aliases: ["New alias"],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    };

    const merged = mergeDocumentsFromVault(current, refreshed);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      aliases: ["New alias"],
      id: "vault-path:Notes/Leadership.md",
      name: "Leadership.md",
      relativePath: "Notes/Leadership.md",
      saveState: "unsaved",
      sourceText: "Local edit",
    });
  });

  it("applies a targeted patch: adds new paths and updates existing ones", () => {
    const current = documentsFromVault({
      files: [
        {
          aliases: ["Old alias"],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    });

    const next = applyVaultPatch(current, {
      removedPaths: [],
      upsertedAssets: [],
      upsertedFiles: [
        {
          aliases: ["New alias"],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
        {
          name: "Second.md",
          parent: "",
          relativePath: "Second.md",
        },
      ],
    });

    expect(next).toHaveLength(2);
    expect(
      next.find((document) => document.relativePath === "Notes/Leadership.md"),
    ).toMatchObject({ aliases: ["New alias"] });
    expect(
      next.find((document) => document.relativePath === "Second.md"),
    ).toMatchObject({ id: "vault-path:Second.md" });
  });

  it("preserves an existing document's local state when a patch updates it", () => {
    const original = documentsFromVault({
      files: [
        {
          aliases: [],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "Personal",
      warnings,
    });
    const current = original.map((document) => ({
      ...document,
      saveState: "unsaved" as const,
      sourceText: "Local edit",
    }));

    const next = applyVaultPatch(current, {
      removedPaths: [],
      upsertedAssets: [],
      upsertedFiles: [
        {
          aliases: ["Refreshed"],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      aliases: ["Refreshed"],
      saveState: "unsaved",
      sourceText: "Local edit",
    });
  });

  it("drops a clean document whose path is reported removed", () => {
    const current = documentsFromVault({
      files: [
        {
          name: "Gone.md",
          parent: "",
          relativePath: "Gone.md",
        },
      ],
      name: "Personal",
      warnings,
    });

    const next = applyVaultPatch(current, {
      removedPaths: ["Gone.md"],
      upsertedAssets: [],
      upsertedFiles: [],
    });

    expect(next).toHaveLength(0);
  });

  it("keeps a dirty document visible even when its path is reported removed", () => {
    const original = documentsFromVault({
      files: [
        {
          name: "Dirty.md",
          parent: "",
          relativePath: "Dirty.md",
        },
      ],
      name: "Personal",
      warnings,
    });
    const current = original.map((document) => ({
      ...document,
      saveState: "unsaved" as const,
      sourceText: "Unsaved local edit",
    }));

    const next = applyVaultPatch(current, {
      removedPaths: ["Dirty.md"],
      upsertedAssets: [],
      upsertedFiles: [],
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      relativePath: "Dirty.md",
      sourceText: "Unsaved local edit",
    });
  });

  it("merges new folder paths in with the existing sort order", () => {
    const merged = mergeFolderPaths(
      ["Archive", "Notes"],
      ["Notes/Nested", "archive"],
    );

    expect(merged).toEqual(["Archive", "archive", "Notes", "Notes/Nested"]);
  });

  it("returns the same folder list when there is nothing new to merge", () => {
    const current = ["Notes"];

    expect(mergeFolderPaths(current, [])).toBe(current);
  });

  it("labels the vault root and nested folders by their last segment", () => {
    expect(folderDisplayName("")).toBe("Vault root");
    expect(folderDisplayName("Notes/Archive")).toBe("Notes/Archive");
    expect(folderName("Notes/Archive")).toBe("Archive");
    expect(folderName("Notes")).toBe("Notes");
  });
});
