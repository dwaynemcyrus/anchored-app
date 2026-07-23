import { describe, expect, it } from "vitest";

import type { VaultSnapshot } from "../lib/tauri/vault";
import {
  documentsFromVault,
  mergeDocumentsFromVault,
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
});
