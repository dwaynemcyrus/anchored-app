import {
  EditorState,
  StateEffect,
  StateField,
  type Transaction,
} from "@codemirror/state";

export type MarkdownPair = {
  close: string;
  open: string;
};

export type AutoPairRange = MarkdownPair & {
  closeFrom: number;
  from: number;
};

export type PairInput = {
  close: string;
  from: number;
  insert: string;
  open: string;
  selection: number;
};

export const MARKDOWN_PAIRS: readonly MarkdownPair[] = [
  { close: "]]", open: "[[" },
  { close: "**", open: "**" },
  { close: "__", open: "__" },
  { close: "~~", open: "~~" },
  { close: "`", open: "`" },
];

const addAutoPair = StateEffect.define<AutoPairRange>();
const removeAutoPair = StateEffect.define<number>();

export const autoPairState = StateField.define<readonly AutoPairRange[]>({
  create: () => [],
  update(value, transaction) {
    const pairs = value
      .map((pair) => ({
        ...pair,
        closeFrom: transaction.changes.mapPos(pair.closeFrom, 1),
        // An external save can insert front matter at the document start.
        // Keep the pair on the document side of that insertion boundary.
        from: transaction.changes.mapPos(pair.from, 1),
      }))
      .filter((pair) => isValidPair(transaction, pair));

    const removed = new Set<number>();
    const added: AutoPairRange[] = [];
    for (const effect of transaction.effects) {
      if (effect.is(removeAutoPair)) removed.add(effect.value);
      if (effect.is(addAutoPair)) added.push(effect.value);
    }

    return [
      ...pairs.filter((pair) => !removed.has(pair.from)),
      ...added.filter((pair) => isValidPair(transaction, pair)),
    ];
  },
});

export function activeAutoPairAt(
  state: EditorState,
  position: number,
): AutoPairRange | null {
  return (
    state
      .field(autoPairState)
      .find(
        (pair) =>
          position >= pair.from + pair.open.length &&
          position <= pair.closeFrom,
      ) ?? null
  );
}

export function removePairEffect(from: number) {
  return removeAutoPair.of(from);
}

export function pairInputAt(
  content: string,
  position: number,
  key: string,
): PairInput | null {
  if (position < 0 || position > content.length) return null;

  for (const pair of MARKDOWN_PAIRS) {
    if (pair.open.length === 1 && key === pair.open) {
      if (!isSafePairingContext(content, position)) return null;
      return {
        close: pair.close,
        from: position,
        insert: `${pair.open}${pair.close}`,
        open: pair.open,
        selection: position + pair.open.length,
      };
    }

    if (
      pair.open.length === 2 &&
      key === pair.open[1] &&
      content.slice(position - 1, position) === pair.open[0] &&
      !isEscaped(content, position - 1) &&
      isSafePairingContext(content, position - 1)
    ) {
      return {
        close: pair.close,
        from: position - 1,
        insert: `${pair.open[1]}${pair.close}`,
        open: pair.open,
        selection: position + pair.open[1].length,
      };
    }
  }

  return null;
}

export function pairClosingAt(
  state: EditorState,
  position: number,
  key: string,
): AutoPairRange | null {
  if (state.selection.main.empty === false) return null;
  const pair = activeAutoPairAt(state, position);
  if (!pair || pair.close[0] !== key) return null;
  return state.sliceDoc(position, position + pair.close.length) === pair.close
    ? pair
    : null;
}

export function emptyPairAt(
  state: EditorState,
  position: number,
): AutoPairRange | null {
  const pair = activeAutoPairAt(state, position);
  if (!pair || pair.closeFrom !== pair.from + pair.open.length) return null;
  return pair;
}

export function addPairEffect(pair: PairInput) {
  return addAutoPair.of({
    close: pair.close,
    closeFrom: pair.from + pair.open.length,
    from: pair.from,
    open: pair.open,
  });
}

function isValidPair(transaction: Transaction, pair: AutoPairRange): boolean {
  return (
    pair.from >= 0 &&
    pair.closeFrom >= pair.from + pair.open.length &&
    transaction.newDoc.sliceString(pair.from, pair.from + pair.open.length) ===
      pair.open &&
    transaction.newDoc.sliceString(
      pair.closeFrom,
      pair.closeFrom + pair.close.length,
    ) === pair.close
  );
}

function isSafePairingContext(content: string, position: number): boolean {
  const lineStart = content.lastIndexOf("\n", position - 1) + 1;
  const lineEndIndex = content.indexOf("\n", position);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");
  const column = position - lineStart;

  if (/^( {4}|\t)/.test(line)) return false;
  if (isInsideFence(content, position)) return false;
  if (isInsideInlineCode(line.slice(0, column))) return false;
  return !isEscaped(content, position);
}

function isInsideFence(content: string, position: number): boolean {
  const before = content.slice(0, position);
  let fenceLength = 0;

  for (const rawLine of before.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const fence = line.match(/^ {0,3}(`{3,})/);
    if (!fence) continue;
    if (fenceLength === 0) fenceLength = fence[1].length;
    else if (fence[1].length >= fenceLength) fenceLength = 0;
  }

  return fenceLength > 0;
}

function isInsideInlineCode(content: string): boolean {
  let delimiter = 0;
  for (let index = 0; index < content.length;) {
    if (content[index] !== "`" || isEscaped(content, index)) {
      index += 1;
      continue;
    }
    let length = 1;
    while (content[index + length] === "`") length += 1;
    if (delimiter === 0) delimiter = length;
    else if (delimiter === length) delimiter = 0;
    index += length;
  }
  return delimiter > 0;
}

function isEscaped(content: string, index: number): boolean {
  let backslashes = 0;
  for (
    let offset = index - 1;
    offset >= 0 && content[offset] === "\\";
    offset -= 1
  ) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
