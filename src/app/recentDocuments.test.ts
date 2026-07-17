import { describe, expect, it } from "vitest";

import type { AnchoredDocument } from "./documents";
import {
  loadDocumentActivity,
  markDocumentActive,
  reconcileDocumentActivity,
  registerFirstSeenDocuments,
  saveDocumentActivity,
} from "./recentDocuments";

class MemoryStorage {
  value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }
}

function note(id: string, relativePath?: string): AnchoredDocument {
  return {
    aliases: [],
    body: "",
    folder: "Notes",
    id,
    name: "Note.md",
    outgoingLinks: [],
    relativePath,
    tags: [],
    title: "Note",
  };
}

describe("recent document activity", () => {
  it("ignores malformed, obsolete, and path-based stored entries", () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({
      entries: [
        {
          documentId: "vault-id:valid",
          firstSeenAt: 10,
          lastActiveAt: 20,
        },
        {
          documentId: "vault-path:Notes/Private.md",
          firstSeenAt: 10,
          lastActiveAt: 20,
        },
      ],
      version: 1,
    });

    expect(Array.from(loadDocumentActivity(storage))).toEqual([
      ["vault-id:valid", { firstSeenAt: 10, lastActiveAt: 20 }],
    ]);
    storage.value = JSON.stringify({ entries: [], version: 0 });
    expect(loadDocumentActivity(storage).size).toBe(0);
    storage.value = "not json";
    expect(loadDocumentActivity(storage).size).toBe(0);
  });

  it("records first-seen time once and includes Finder-added files", () => {
    const initial = registerFirstSeenDocuments(
      new Map(),
      [note("vault-id:one", "Notes/One.md"), note("draft-one")],
      100,
    );
    const rescanned = registerFirstSeenDocuments(
      initial,
      [
        note("vault-id:one", "Writing/One.md"),
        note("vault-id:two", "Notes/Two.md"),
      ],
      200,
    );

    expect(Array.from(rescanned)).toEqual([
      ["vault-id:one", { firstSeenAt: 100, lastActiveAt: 0 }],
      ["vault-id:two", { firstSeenAt: 200, lastActiveAt: 0 }],
    ]);
  });

  it("marks opened, edited, or created notes as active without moving first seen", () => {
    const activity = markDocumentActive(
      new Map([["vault-id:one", { firstSeenAt: 10, lastActiveAt: 20 }]]),
      "vault-id:one",
      30,
    );

    expect(activity.get("vault-id:one")).toEqual({
      firstSeenAt: 10,
      lastActiveAt: 30,
    });
  });

  it("drops stale activity while registering newly discovered notes", () => {
    const activity = new Map([
      ["vault-id:kept", { firstSeenAt: 10, lastActiveAt: 20 }],
      ["vault-id:missing", { firstSeenAt: 5, lastActiveAt: 30 }],
    ]);

    expect(
      Array.from(
        reconcileDocumentActivity(
          activity,
          [
            note("vault-id:kept", "Writing/Kept.md"),
            note("vault-id:new", "Notes/New.md"),
          ],
          40,
        ),
      ),
    ).toEqual([
      ["vault-id:kept", { firstSeenAt: 10, lastActiveAt: 20 }],
      ["vault-id:new", { firstSeenAt: 40, lastActiveAt: 0 }],
    ]);
  });

  it("persists only bounded stable identifiers without filenames or paths", () => {
    const storage = new MemoryStorage();
    const activity = new Map(
      Array.from({ length: 520 }, (_, index) => [
        `vault-id:${index}`,
        { firstSeenAt: index, lastActiveAt: index },
      ]),
    );
    activity.set("vault-path:Notes/Private.md", {
      firstSeenAt: 1,
      lastActiveAt: 999,
    });

    saveDocumentActivity(storage, activity);

    expect(storage.value).not.toContain("Private.md");
    expect(loadDocumentActivity(storage).size).toBe(500);
    expect(loadDocumentActivity(storage).has("vault-id:519")).toBe(true);
    expect(loadDocumentActivity(storage).has("vault-id:0")).toBe(false);
  });
});
