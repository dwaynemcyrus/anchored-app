import { describe, expect, it } from "vitest";

import { loadMarkdownSettings, saveMarkdownSettings } from "./settings";
import { DEFAULT_MARKDOWN_SETTINGS, type MarkdownSettings } from "./types";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    length: values.size,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Markdown settings", () => {
  it("loads defaults and persists a versioned settings object", () => {
    const target = storage();
    expect(loadMarkdownSettings(target)).toEqual(DEFAULT_MARKDOWN_SETTINGS);

    const settings: MarkdownSettings = {
      ...DEFAULT_MARKDOWN_SETTINGS,
      autoLinkUrls: false,
      mermaid: false,
    };
    saveMarkdownSettings(target, settings);

    expect(loadMarkdownSettings(target)).toEqual(settings);
  });

  it("rejects malformed and unknown versions", () => {
    const target = storage();
    target.setItem("anchored.markdown-settings.v1", '{"version":99}');
    expect(loadMarkdownSettings(target)).toEqual(DEFAULT_MARKDOWN_SETTINGS);
  });

  it("migrates version one settings to the default editor size", () => {
    const target = storage();
    target.setItem(
      "anchored.markdown-settings.v1",
      JSON.stringify({
        version: 1,
        autoLinkUrls: false,
        emoji: true,
        mermaid: false,
        smartTypography: true,
        syntaxHighlighting: true,
      }),
    );

    expect(loadMarkdownSettings(target)).toEqual({
      ...DEFAULT_MARKDOWN_SETTINGS,
      autoLinkUrls: false,
      mermaid: false,
    });
  });

  it("does not throw when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    } as Pick<Storage, "getItem" | "setItem">;

    expect(loadMarkdownSettings(blocked)).toEqual(DEFAULT_MARKDOWN_SETTINGS);
    expect(() =>
      saveMarkdownSettings(blocked, DEFAULT_MARKDOWN_SETTINGS),
    ).not.toThrow();
  });
});
