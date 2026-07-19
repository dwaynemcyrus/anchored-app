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
      {
        assetListMode: "alphabetical",
        mode: "files",
        workbenchListMode: "grouped",
        workbenchSort: "created-asc",
      },
    );
    const persisted = setItem.mock.calls[0]?.[1] as string;

    expect(loadFileRailPreferences({ getItem: () => persisted })).toEqual({
      assetListMode: "alphabetical",
      mode: "files",
      workbenchListMode: "grouped",
      workbenchSort: "created-asc",
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

  it("migrates version 1 without losing the selected rail mode", () => {
    expect(
      loadFileRailPreferences({
        getItem: () =>
          JSON.stringify({
            assetListMode: "alphabetical",
            mode: "files",
            version: 1,
          }),
      }),
    ).toEqual({
      assetListMode: "alphabetical",
      mode: "files",
      workbenchListMode: "flat",
      workbenchSort: "modified-desc",
    });
  });
});
