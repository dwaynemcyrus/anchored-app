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
