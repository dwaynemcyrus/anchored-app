import { describe, expect, it, vi } from "vitest";

import {
  defaultFileRailPreferences,
  loadFileRailPreferences,
  saveFileRailPreferences,
} from "./fileRailPreferences";

describe("file rail preferences", () => {
  it("defaults to grouped Collections", () => {
    expect(loadFileRailPreferences({ getItem: () => null })).toEqual(
      defaultFileRailPreferences,
    );
  });

  it("loads and saves versioned view preferences", () => {
    const setItem = vi.fn();
    saveFileRailPreferences(
      { setItem },
      { assetListMode: "alphabetical", mode: "files" },
    );
    const persisted = setItem.mock.calls[0]?.[1] as string;

    expect(loadFileRailPreferences({ getItem: () => persisted })).toEqual({
      assetListMode: "alphabetical",
      mode: "files",
    });
  });

  it("falls back safely for malformed or unavailable storage", () => {
    expect(loadFileRailPreferences({ getItem: () => "{" })).toEqual(
      defaultFileRailPreferences,
    );
    expect(
      loadFileRailPreferences({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(defaultFileRailPreferences);

    expect(() =>
      saveFileRailPreferences(
        {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        defaultFileRailPreferences,
      ),
    ).not.toThrow();
  });
});
