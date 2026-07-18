import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import deflist from "markdown-it-deflist";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";

import {
  ADMONITION_TYPES,
  DEFAULT_MARKDOWN_SETTINGS,
  type AdmonitionType,
  type MarkdownRenderResult,
  type MarkdownSettings,
} from "./types";

type FrontMatterBounds = {
  bodyStart: number;
  end: number;
  raw: string;
};

type MarkdownEnvironment = {
  headingIds?: Set<string>;
};

const ADMONITION_TYPE_SET = new Set<string>(ADMONITION_TYPES);
const instanceCache = new Map<string, MarkdownIt>();

function frontMatterBounds(source: string): FrontMatterBounds | null {
  const bom = source.startsWith("\uFEFF") ? 1 : 0;
  const firstLineEnd = source.indexOf("\n", bom);
  const firstLine = source.slice(
    bom,
    firstLineEnd < 0 ? source.length : firstLineEnd,
  );
  if (firstLine.replace(/\r$/, "") !== "---") return null;

  const bodyStart = firstLineEnd < 0 ? source.length : firstLineEnd + 1;
  let cursor = bodyStart;
  while (cursor <= source.length) {
    const lineEnd = source.indexOf("\n", cursor);
    const end = lineEnd < 0 ? source.length : lineEnd;
    const line = source.slice(cursor, end).replace(/\r$/, "");
    if (line === "---" || line === "...") {
      const contentEnd = cursor;
      const fullEnd = lineEnd < 0 ? source.length : lineEnd + 1;
      return {
        bodyStart: fullEnd,
        end: fullEnd,
        raw: source.slice(bom, contentEnd),
      };
    }
    if (lineEnd < 0) break;
    cursor = lineEnd + 1;
  }
  return null;
}

function splitFrontMatter(source: string): {
  body: string;
  frontMatter?: string;
} {
  const bounds = frontMatterBounds(source);
  if (!bounds) return { body: source };
  return {
    body: source.slice(bounds.bodyStart),
    frontMatter: bounds.raw,
  };
}

function maskTildeFences(source: string): string {
  const lines = source.split(/(\r?\n)/);
  let insideFence = false;
  return lines
    .map((part) => {
      if (part === "\n" || part === "\r\n") return part;
      const match = /^( {0,3})(~{3,})([^\n]*)$/.exec(part);
      if (!match) return part;
      insideFence = !insideFence;
      return `${match[1]}${match[2].replace(/~/g, "\\~")}${match[3]}`;
    })
    .join("");
}

function slugifyHeading(value: string): string {
  const slug = value
    .replace(/<[^>]*>/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/[\s-]+/g, "-");
  return slug || "section";
}

function parseHeadingAttribute(
  value: string,
): { id: string; text: string } | null {
  const match = /\s+\{#([A-Za-z][A-Za-z0-9:._-]*)\}\s*$/.exec(value);
  if (!match || match.index === undefined) return null;
  return { id: match[1], text: value.slice(0, match.index).trimEnd() };
}

function parseInlineChildren(md: MarkdownIt, value: string, env: unknown) {
  return md.parseInline(value, env)[0]?.children ?? [];
}

function headingAttributePlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "anchored-heading-attributes", (state) => {
    for (let index = 0; index < state.tokens.length - 1; index += 1) {
      const heading = state.tokens[index];
      const inline = state.tokens[index + 1];
      if (heading.type !== "heading_open" || inline.type !== "inline") continue;
      const explicit = parseHeadingAttribute(inline.content);
      if (!explicit) continue;
      inline.content = explicit.text;
      inline.children = parseInlineChildren(state.md, explicit.text, state.env);
      heading.meta = { ...(heading.meta ?? {}), explicitId: explicit.id };
    }
  });
}

function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("text", "anchored-wikilink", (state, silent) => {
    if (!state.src.startsWith("[[", state.pos)) return false;
    const close = state.src.indexOf("]]", state.pos + 2);
    if (close < 0) return false;
    const value = state.src.slice(state.pos + 2, close);
    if (!value || value.includes("\n")) return false;
    if (silent) return true;
    const separator = value.indexOf("|");
    const target = (separator < 0 ? value : value.slice(0, separator)).trim();
    const label = (separator < 0 ? value : value.slice(separator + 1)).trim();
    if (!target) return false;
    const token = state.push("wikilink", "a", 0);
    token.meta = { label: label || target, target };
    state.pos = close + 2;
    return true;
  });
}

function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    "fence",
    "anchored-math-block",
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const line = state.src.slice(start, state.eMarks[startLine]);
      if (!line.startsWith("$$")) return false;
      if (silent) return true;

      const lines: string[] = [];
      let nextLine = startLine;
      const first = line.slice(2).trim();
      if (first && first.endsWith("$$")) {
        lines.push(first.slice(0, -2));
        nextLine += 1;
      } else {
        if (first) lines.push(first);
        nextLine += 1;
        while (nextLine < endLine) {
          const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineEnd = state.eMarks[nextLine];
          const value = state.src.slice(lineStart, lineEnd);
          if (value.trim() === "$$") {
            nextLine += 1;
            break;
          }
          lines.push(value);
          nextLine += 1;
        }
      }
      const token = state.push("math_block", "div", 0);
      token.block = true;
      token.content = lines.join("\n");
      token.map = [startLine, nextLine];
      state.line = nextLine;
      return true;
    },
  );

  md.inline.ruler.before("escape", "anchored-math-inline", (state, silent) => {
    if (state.src[state.pos] !== "$" || state.src[state.pos + 1] === "$") {
      return false;
    }
    const close = state.src.indexOf("$", state.pos + 1);
    if (close < 0 || close === state.pos + 1) return false;
    const value = state.src.slice(state.pos + 1, close);
    if (value.includes("\n") || value.endsWith("\\")) return false;
    if (silent) return true;
    const token = state.push("math_inline", "span", 0);
    token.content = value;
    state.pos = close + 1;
    return true;
  });
}

function admonitionPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "anchored-admonitions", (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const opening = state.tokens[index];
      if (opening.type !== "blockquote_open") continue;
      const closeIndex = state.tokens.findIndex(
        (token, tokenIndex) =>
          tokenIndex > index &&
          tokenIndex > index &&
          token.type === "blockquote_close",
      );
      if (closeIndex < 0) continue;
      const inline = state.tokens
        .slice(index + 1, closeIndex)
        .find((token) => token.type === "inline");
      if (!inline) continue;
      const marker = /^\[!([A-Za-z]+)\](?:[ \t]+([^\n]*))?(?:\n|$)/.exec(
        inline.content,
      );
      if (!marker || !ADMONITION_TYPE_SET.has(marker[1].toLowerCase()))
        continue;
      const type = marker[1].toLowerCase() as AdmonitionType;
      const remainder = inline.content
        .slice(marker[0].length)
        .replace(/^\n+/, "");
      inline.content = remainder;
      inline.children = parseInlineChildren(state.md, remainder, state.env);
      opening.meta = {
        ...(opening.meta ?? {}),
        admonition: {
          title: marker[2]?.trim() || type[0].toUpperCase() + type.slice(1),
          type,
        },
      };
      if (!remainder) {
        const inlineIndex = state.tokens.indexOf(inline);
        const paragraphOpen = state.tokens[inlineIndex - 1];
        const paragraphClose = state.tokens[inlineIndex + 1];
        if (paragraphOpen?.type === "paragraph_open")
          paragraphOpen.hidden = true;
        inline.hidden = true;
        if (paragraphClose?.type === "paragraph_close")
          paragraphClose.hidden = true;
      }
      index = closeIndex;
    }
  });
}

function renderMath(content: string, displayMode: boolean): string {
  return katex.renderToString(content, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
  });
}

function createMarkdownIt(settings: MarkdownSettings): MarkdownIt {
  const cacheKey = JSON.stringify(settings);
  const cached = instanceCache.get(cacheKey);
  if (cached) return cached;

  const md = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: settings.autoLinkUrls,
    typographer: settings.smartTypography,
    highlight: settings.syntaxHighlighting
      ? (value, language) => {
          if (!language || !hljs.getLanguage(language)) return "";
          try {
            return hljs.highlight(value, { language, ignoreIllegals: true })
              .value;
          } catch {
            return "";
          }
        }
      : undefined,
  });

  md.use(deflist).use(footnote).use(mark).use(sub).use(sup).use(taskLists, {
    enabled: false,
  });
  if (settings.emoji) md.use(emoji);
  md.use(anchor, { slugify: slugifyHeading });
  headingAttributePlugin(md);
  wikilinkPlugin(md);
  mathPlugin(md);
  admonitionPlugin(md);

  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, slf) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
    if (settings.mermaid && language === "mermaid") {
      return `<div class="markdown-mermaid"><pre><code>${md.utils.escapeHtml(token.content)}</code></pre></div>`;
    }
    return defaultFence
      ? defaultFence(tokens, index, options, env, slf)
      : slf.renderToken(tokens, index, options);
  };
  md.renderer.rules.math_inline = (tokens, index) =>
    renderMath(tokens[index].content, false);
  md.renderer.rules.math_block = (tokens, index) =>
    `<div class="markdown-math">${renderMath(tokens[index].content, true)}</div>`;
  md.renderer.rules.wikilink = (tokens, index) => {
    const meta = tokens[index].meta as { label: string; target: string };
    return `<a class="markdown-wikilink" data-wikilink-target="${md.utils.escapeHtml(meta.target)}" href="#">${md.utils.escapeHtml(meta.label)}</a>`;
  };
  const defaultBlockquoteOpen = md.renderer.rules.blockquote_open;
  const defaultBlockquoteClose = md.renderer.rules.blockquote_close;
  md.renderer.rules.blockquote_open = (tokens, index, options, env, slf) => {
    const admonition = tokens[index].meta?.admonition as
      { title: string; type: AdmonitionType } | undefined;
    if (!admonition) {
      return defaultBlockquoteOpen
        ? defaultBlockquoteOpen(tokens, index, options, env, slf)
        : slf.renderToken(tokens, index, options);
    }
    return `<aside class="markdown-admonition markdown-admonition--${admonition.type}" data-admonition-type="${admonition.type}"><p class="markdown-admonition__title">${md.utils.escapeHtml(admonition.title)}</p>`;
  };
  md.renderer.rules.blockquote_close = (tokens, index, options, env, slf) => {
    if (tokens[index - 1]?.type === "blockquote_open") return "</aside>";
    const opening = tokens
      .slice(0, index)
      .reverse()
      .find((token) => token.type === "blockquote_open");
    if (opening?.meta?.admonition) return "</aside>";
    return defaultBlockquoteClose
      ? defaultBlockquoteClose(tokens, index, options, env, slf)
      : slf.renderToken(tokens, index, options);
  };
  md.renderer.rules.heading_open = (tokens, index, options, env, slf) => {
    const token = tokens[index];
    const inline = tokens[index + 1];
    const explicitId = token.meta?.explicitId as string | undefined;
    const text = inline?.content ?? "section";
    const renderEnvironment = env as MarkdownEnvironment | undefined;
    const ids = renderEnvironment?.headingIds ?? new Set<string>();
    if (renderEnvironment) renderEnvironment.headingIds = ids;
    let id = explicitId ?? slugifyHeading(text);
    if (!explicitId) {
      let suffix = 2;
      while (ids.has(id)) id = `${slugifyHeading(text)}-${suffix++}`;
    }
    ids.add(id);
    token.attrSet("id", id);
    return slf.renderToken(tokens, index, options);
  };

  instanceCache.set(cacheKey, md);
  return md;
}

export function renderMarkdown(
  source: string,
  settings: MarkdownSettings = DEFAULT_MARKDOWN_SETTINGS,
): MarkdownRenderResult {
  const { body, frontMatter } = splitFrontMatter(source);
  const env: MarkdownEnvironment = { headingIds: new Set() };
  const html = createMarkdownIt(settings).render(maskTildeFences(body), env);
  return {
    body,
    frontMatter,
    html: DOMPurify.sanitize(html, {
      ADD_ATTR: ["data-admonition-type", "data-wikilink-target"],
      ALLOW_DATA_ATTR: true,
      USE_PROFILES: { html: true },
    }),
  };
}

export function clearMarkdownRendererCache(): void {
  instanceCache.clear();
}
