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
      showFileExtensions: true,
    };
    saveMarkdownSettings(target, settings);

    expect(loadMarkdownSettings(target)).toEqual(settings);
  });

  it("migrates older settings to the default theme", () => {
    const target = storage();
    target.setItem(
      "anchored.markdown-settings.v1",
      JSON.stringify({
        version: 2,
        autoLinkUrls: true,
        editorFontSize: 14,
        emoji: true,
        mermaid: true,
        smartTypography: true,
        syntaxHighlighting: true,
      }),
    );

    expect(loadMarkdownSettings(target).theme).toBe("anchored");
    expect(loadMarkdownSettings(target).showFileExtensions).toBe(false);
  });

  it("defaults extension display off for version three settings without it", () => {
    const target = storage();
    target.setItem(
      "anchored.markdown-settings.v1",
      JSON.stringify({
        version: 3,
        autoLinkUrls: true,
        editorFontSize: 14,
        emoji: true,
        mermaid: true,
        smartTypography: true,
        syntaxHighlighting: true,
        theme: "anchored",
      }),
    );

    expect(loadMarkdownSettings(target).showFileExtensions).toBe(false);
    expect(loadMarkdownSettings(target).updateTypeOnExternalMove).toBe(true);
  });

  it("loads the external move setting from version four settings", () => {
    const target = storage();
    target.setItem(
      "anchored.markdown-settings.v1",
      JSON.stringify({
        version: 4,
        autoLinkUrls: true,
        editorFontSize: 14,
        emoji: true,
        mermaid: true,
        showFileExtensions: false,
        smartTypography: true,
        syntaxHighlighting: true,
        theme: "anchored",
        updateTypeOnExternalMove: false,
      }),
    );

    expect(loadMarkdownSettings(target).updateTypeOnExternalMove).toBe(false);
  });

  it("loads the editor line length from version five settings", () => {
    const target = storage();
    target.setItem(
      "anchored.markdown-settings.v1",
      JSON.stringify({
        version: 5,
        autoLinkUrls: true,
        editorFontSize: 14,
        editorLineLength: 72,
        emoji: true,
        mermaid: true,
        showFileExtensions: false,
        smartTypography: true,
        syntaxHighlighting: true,
        theme: "anchored",
        updateTypeOnExternalMove: true,
      }),
    );

    expect(loadMarkdownSettings(target).editorLineLength).toBe(72);
  });

  it("rejects an unknown theme and falls back to the default", () => {
    const target = storage();
    target.setItem(
      "anchored.markdown-settings.v1",
      JSON.stringify({
        version: 3,
        autoLinkUrls: true,
        editorFontSize: 14,
        emoji: true,
        mermaid: true,
        smartTypography: true,
        syntaxHighlighting: true,
        theme: "unknown",
      }),
    );

    expect(loadMarkdownSettings(target)).toEqual(DEFAULT_MARKDOWN_SETTINGS);
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
