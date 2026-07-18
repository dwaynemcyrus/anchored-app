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
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
    });

    expect(loadSessionState(storage)).toEqual({
      activeRelativePath: "Notes/Leadership.md",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
    });
  });

  it("ignores malformed storage and supports clearing", () => {
    const storage = createStorage();
    storage.setItem("anchored.session.v1", JSON.stringify({ version: 999 }));

    expect(loadSessionState(storage)).toBeNull();

    saveSessionState(storage, {
      activeRelativePath: "Notes/Leadership.md",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
    });
    clearSessionState(storage);
    expect(loadSessionState(storage)).toBeNull();
  });
});
