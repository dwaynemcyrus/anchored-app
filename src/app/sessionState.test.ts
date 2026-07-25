import { describe, expect, it } from "vitest";

import {
  clearSessionState,
  loadSessionState,
  saveSessionState,
} from "./sessionState";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("sessionState", () => {
  it("round-trips the current vault and note path", () => {
    const storage = createStorage();

    saveSessionState(storage, {
      activeRelativePath: "Notes/Leadership.md",
      vaultId: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
    });

    expect(loadSessionState(storage)).toEqual({
      activeRelativePath: "Notes/Leadership.md",
      vaultId: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
    });
  });

  it("ignores malformed storage and supports clearing", () => {
    const storage = createStorage();
    storage.setItem("anchored.session.v1", JSON.stringify({ version: 999 }));

    expect(loadSessionState(storage)).toBeNull();

    saveSessionState(storage, {
      activeRelativePath: "Notes/Leadership.md",
      vaultId: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
    });
    clearSessionState(storage);
    expect(loadSessionState(storage)).toBeNull();
  });
});
