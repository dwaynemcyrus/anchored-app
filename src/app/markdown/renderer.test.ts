import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./renderer";
import { DEFAULT_MARKDOWN_SETTINGS } from "./types";

describe("Anchored Markdown renderer", () => {
  it("renders the Version 1 feature set without rewriting source", () => {
    const source = [
      "---",
      "id: note_01JZQ7K8P4",
      "title: Leadership",
      "---",
      "# Leadership {#leadership}",
      "",
      "A bare URL https://example.com, ==important==, :warning:, H~2~O, and x^2^.",
      "~~obsolete~~ and \\`inline code\\`.",
      "",
      "| Name | Age |",
      "| :--- | ---: |",
      "| John | 32 |",
      "",
      "- [ ] Draft",
      "- [x] Review",
      "",
      "> [!TIP] Writing Advice",
      "> Write the first draft without editing.",
      "",
      "Markdown",
      ": Plain text formatting language",
      "",
      "Text.[^1] [[Leadership|the note]]",
      "",
      "[^1]: Example footnote.",
      "",
      "$E=mc^2$",
      "",
      "$$",
      "a^2+b^2=c^2",
      "$$",
      "",
      "```rust",
      "fn main() {}",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "A --> B",
      "```",
    ].join("\n");

    const rendered = renderMarkdown(source);

    expect(rendered.frontMatter).toContain("id: note_01JZQ7K8P4");
    expect(rendered.body).toBe(source.slice(source.indexOf("# Leadership")));
    expect(rendered.html).toContain('<h1 id="leadership"');
    expect(rendered.html).toContain(">Leadership</h1>");
    expect(rendered.html).toContain('href="https://example.com"');
    expect(rendered.html).toContain("<mark>important</mark>");
    expect(rendered.html).toContain("<s>obsolete</s>");
    expect(rendered.html).toContain("⚠️");
    expect(rendered.html).toContain("<sub>2</sub>");
    expect(rendered.html).toContain("<sup>2</sup>");
    expect(rendered.html).toContain("markdown-admonition--tip");
    expect(rendered.html).toContain("<dl>");
    expect(rendered.html).toContain("footnote");
    expect(rendered.html).toContain("katex");
    expect(rendered.html).toContain('class="language-rust"');
    expect(rendered.html).toContain("markdown-mermaid");
    expect(rendered.html).toContain('type="checkbox"');
  });

  it("keeps heading IDs unique and preserves unknown admonition text", () => {
    const rendered = renderMarkdown(
      "# One {#same}\n# Two {#same}\n\n> [!CUSTOM]\n> Keep this portable.",
    );

    expect(rendered.html).toContain('<h1 id="same"');
    expect(rendered.html).toContain('<h1 id="same-2"');
    expect(rendered.html).not.toContain("markdown-admonition");
    expect(rendered.html).toContain("[!CUSTOM]");
  });

  it("keeps bare URL linking configurable while preserving explicit links", () => {
    const source =
      "Bare https://example.com and [explicit](https://example.com).";
    const rendered = renderMarkdown(source, {
      ...DEFAULT_MARKDOWN_SETTINGS,
      autoLinkUrls: false,
    });

    expect(rendered.html.match(/href="https:\/\/example\.com"/g)).toHaveLength(
      1,
    );
    expect(rendered.html).toContain(">explicit</a>");
  });

  it("does not interpret tilde fences as code blocks", () => {
    const source = "~~~rust\nfn main() {}\n~~~";
    const rendered = renderMarkdown(source);

    expect(rendered.html).not.toContain('class="language-rust"');
    expect(rendered.html).toContain("~~~rust");
    expect(rendered.html).toContain("fn main() {}");
  });

  it("disables every optional render-only transform without changing source", () => {
    const source = 'https://example.com "quotes" -- … :warning: ==mark==';
    const rendered = renderMarkdown(source, {
      autoLinkUrls: false,
      backslashLineBreaks: true,
      editorFontSize: 14,
      editorLineLength: 64,
      emoji: false,
      mermaid: false,
      showFileExtensions: false,
      smartTypography: false,
      syntaxHighlighting: false,
      theme: "anchored",
      updateTypeOnExternalMove: false,
    });

    expect(rendered.body).toBe(source);
    expect(rendered.html).not.toContain('href="https://example.com"');
    expect(rendered.html).toContain(":warning:");
    expect(
      renderMarkdown("```rust\nfn main() {}\n```", {
        autoLinkUrls: true,
        backslashLineBreaks: true,
        editorFontSize: 14,
        editorLineLength: 64,
        emoji: true,
        mermaid: true,
        showFileExtensions: false,
        smartTypography: true,
        syntaxHighlighting: false,
        theme: "anchored",
        updateTypeOnExternalMove: true,
      }).html,
    ).not.toContain("hljs-");
  });

  it("escapes raw HTML and unsafe links", () => {
    const rendered = renderMarkdown(
      '<script>alert("x")</script> [bad](javascript:alert("x"))',
    );

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain('href="javascript:');
    expect(rendered.html).toContain("&lt;script&gt;");
  });
});
