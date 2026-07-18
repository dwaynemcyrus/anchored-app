import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

type MarkdownDecorationRange = {
  className: string;
  from: number;
  to: number;
};

const PATTERNS: Array<[RegExp, string]> = [
  [/\[\[[^\]\n]+\]\]/g, "cm-anchored-wikilink"],
  [/\[\^[^\]\n]+\]/g, "cm-anchored-footnote"],
  [/\{#[A-Za-z][A-Za-z0-9:._-]*\}/g, "cm-anchored-heading-id"],
  [/==[^=\n]+==/g, "cm-anchored-mark"],
  [/:([A-Za-z0-9_+-]+):/g, "cm-anchored-emoji"],
  [/\[(?: |x|X)\](?=\s)/g, "cm-anchored-task"],
  [
    /^\s{0,3}>\s*\[!(?:NOTE|ABSTRACT|INFO|TIP|SUCCESS|QUESTION|WARNING|FAILURE|DANGER|BUG|EXAMPLE|QUOTE)\]/gim,
    "cm-anchored-admonition",
  ],
  [/^\s*```[^\n]*$/gm, "cm-anchored-fence"],
];

function addPatternMatches(
  source: string,
  start: number,
  end: number,
  pattern: RegExp,
  className: string,
  ranges: MarkdownDecorationRange[],
): void {
  pattern.lastIndex = 0;
  const text = source.slice(start, end);
  let match = pattern.exec(text);
  while (match) {
    ranges.push({
      className,
      from: start + match.index,
      to: start + match.index + match[0].length,
    });
    match = pattern.exec(text);
  }
}

function addMathMatches(
  source: string,
  start: number,
  end: number,
  ranges: MarkdownDecorationRange[],
): void {
  const text = source.slice(start, end);
  let cursor = 0;
  while (cursor < text.length) {
    const dollar = text.indexOf("$", cursor);
    if (dollar < 0) break;
    if (text[dollar + 1] === "$") {
      cursor = dollar + 2;
      continue;
    }
    const close = text.indexOf("$", dollar + 1);
    if (close < 0 || close === dollar + 1 || text[close + 1] === "$") {
      cursor = dollar + 1;
      continue;
    }
    ranges.push({
      className: "cm-anchored-math",
      from: start + dollar,
      to: start + close + 1,
    });
    cursor = close + 1;
  }
}

export function findMarkdownDecorationRanges(
  source: string,
  start = 0,
  end = source.length,
): MarkdownDecorationRange[] {
  const ranges: MarkdownDecorationRange[] = [];
  for (const [pattern, className] of PATTERNS) {
    addPatternMatches(source, start, end, pattern, className, ranges);
  }
  addMathMatches(source, start, end, ranges);
  return ranges.sort(
    (left, right) => left.from - right.from || left.to - right.to,
  );
}

export function findFrontMatterDecorationRanges(
  source: string,
  start = 0,
  end = source.length,
): MarkdownDecorationRange[] {
  const lines = source.split("\n");
  const ranges: MarkdownDecorationRange[] = [];
  let offset = 0;
  let closingLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, "");
    if (index > 0 && line.trim() === "---") {
      closingLine = index;
      break;
    }
    offset += lines[index].length + 1;
  }

  if (closingLine < 0 || !/^\uFEFF?---\s*$/.test(lines[0].replace(/\r$/, ""))) {
    return ranges;
  }

  offset = 0;
  for (let index = 0; index <= closingLine; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.replace(/\r$/, "");
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset += rawLine.length + 1;

    if (index === 0 || index === closingLine) {
      ranges.push({
        className: "cm-anchored-frontmatter-delimiter",
        from: lineStart,
        to: lineEnd,
      });
      continue;
    }

    const commentStart = line.search(/\s+#|^\s*#/);
    const contentEnd = commentStart >= 0 ? commentStart : line.length;
    const commentOffset = commentStart >= 0 ? lineStart + commentStart : -1;
    if (commentOffset >= 0) {
      ranges.push({
        className: "cm-anchored-frontmatter-comment",
        from: commentOffset,
        to: lineEnd,
      });
    }

    const keyMatch = /^(\s*)(?:-\s+)?([A-Za-z_][\w.-]*)(?=\s*:)/.exec(line);
    if (keyMatch) {
      const keyStart = lineStart + keyMatch[1].length;
      ranges.push({
        className: "cm-anchored-frontmatter-key",
        from: keyStart,
        to: keyStart + keyMatch[2].length,
      });
    }

    const colon = line.indexOf(":", keyMatch?.index ?? 0);
    const listMarker = /^\s*-\s+/.exec(line);
    if (listMarker) {
      ranges.push({
        className: "cm-anchored-frontmatter-list-marker",
        from: lineStart + listMarker.index,
        to: lineStart + listMarker[0].length,
      });
    }

    const valueStart =
      colon >= 0 ? colon + 1 : listMarker ? listMarker[0].length : line.length;
    const value = line.slice(valueStart, contentEnd).trim();
    if (value.length > 0) {
      const valueOffset = line.indexOf(value, valueStart);
      ranges.push({
        className: "cm-anchored-frontmatter-value",
        from: lineStart + valueOffset,
        to: lineStart + valueOffset + value.length,
      });
    }
  }

  return ranges
    .filter((range) => range.from < end && range.to > start)
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    for (const match of findMarkdownDecorationRanges(
      view.state.doc.toString(),
      range.from,
      range.to,
    )) {
      builder.add(
        match.from,
        match.to,
        Decoration.mark({ class: match.className }),
      );
    }
  }
  return builder.finish();
}

class MarkdownDecorationPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildDecorations(update.view);
    }
  }
}

export const markdownEditorDecorations = ViewPlugin.fromClass(
  MarkdownDecorationPlugin,
  { decorations: (value) => value.decorations },
);

class FrontMatterDecorationPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }

  private build(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    for (const range of view.visibleRanges) {
      for (const match of findFrontMatterDecorationRanges(
        view.state.doc.toString(),
        range.from,
        range.to,
      )) {
        builder.add(
          match.from,
          match.to,
          Decoration.mark({ class: match.className }),
        );
      }
    }
    return builder.finish();
  }
}

export const frontMatterEditorDecorations = ViewPlugin.fromClass(
  FrontMatterDecorationPlugin,
  { decorations: (value) => value.decorations },
);
