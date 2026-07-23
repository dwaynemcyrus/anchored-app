import { describe, expect, it } from "vitest";

import {
  loadConflictSnapshots,
  saveConflictSnapshot,
} from "./conflictSnapshots";

describe("conflictSnapshots", () => {
  it("keeps the newest snapshot per path and bounds history", () => {
    const storage = window.localStorage;
    for (let index = 0; index < 25; index += 1) {
      saveConflictSnapshot(storage, {
        base: "base",
        external: `external-${index}`,
        local: "local",
        path: `Note-${index}.md`,
        savedAt: index,
        vaultId: "vault",
      });
    }
    expect(loadConflictSnapshots(storage)).toHaveLength(20);
  });
});
