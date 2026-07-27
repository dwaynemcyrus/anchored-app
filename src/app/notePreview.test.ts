import { describe, expect, it } from "vitest";

import { notePreview, notePreviewKey } from "./notePreview";

describe("notePreview", () => {
  it("drops YAML front matter", () => {
    expect(
      notePreview(
        ["---", "id: 01JZ", "tags: [travel]", "---", "", "Body text."].join(
          "\n",
        ),
      ),
    ).toBe("Body text.");
  });

  it("leaves a document without front matter alone", () => {
    expect(notePreview("Just a sentence.")).toBe("Just a sentence.");
  });

  it("strips heading, quote, bullet, and task syntax", () => {
    expect(
      notePreview("# Title\n\n> Quoted\n\n- One\n- [ ] Two\n1. Three"),
    ).toBe("Title Quoted One Two Three");
  });

  it("keeps the label from links and wikilinks", () => {
    expect(notePreview("See [[Deep Work]] and [[Notes|my notes]].")).toBe(
      "See Deep Work and my notes.",
    );
    expect(notePreview("Read [the guide](https://example.com).")).toBe(
      "Read the guide.",
    );
  });

  it("removes images, embeds, fenced code, and HTML", () => {
    expect(notePreview("![alt](a.png) text")).toBe("text");
    expect(notePreview("![[diagram.svg]] text")).toBe("text");
    expect(notePreview("```js\nconst a = 1;\n```\nAfter")).toBe("After");
    expect(notePreview("<div>markup</div> after")).toBe("markup after");
  });

  it("removes inline emphasis and code markers", () => {
    expect(notePreview("**Bold**, _thin_, ~~gone~~, ==mark==, `code`.")).toBe(
      "Bold, thin, gone, mark, code.",
    );
  });

  it("collapses whitespace across lines", () => {
    expect(notePreview("One\n\n\nTwo   three\t four")).toBe(
      "One Two three four",
    );
  });

  it("truncates long documents with an ellipsis", () => {
    const preview = notePreview("word ".repeat(200));

    expect(preview.length).toBeLessThanOrEqual(221);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("returns an empty string for an empty or front-matter-only note", () => {
    expect(notePreview("")).toBe("");
    expect(notePreview("---\nid: 01JZ\n---\n")).toBe("");
  });
});

describe("notePreviewKey", () => {
  it("changes when the file's modified time changes", () => {
    expect(notePreviewKey("a.md", 1)).not.toBe(notePreviewKey("a.md", 2));
  });

  it("is stable for the same file and time", () => {
    expect(notePreviewKey("a.md", 1)).toBe(notePreviewKey("a.md", 1));
  });

  it("tolerates a missing modified time", () => {
    expect(notePreviewKey("a.md")).toBe("a.md@0");
  });
});
