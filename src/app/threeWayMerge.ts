export type MergeResult =
  | { status: "clean"; content: string }
  | { status: "conflict"; reason: "overlap" | "multiple-edits" };

type LineEdit = {
  end: number;
  replacement: string[];
  start: number;
};

/**
 * Merges one bounded edit from each side. Ambiguous or overlapping edits are
 * deliberately rejected so a bad merge can never silently destroy prose.
 */
export function mergeThreeWay(
  base: string,
  local: string,
  external: string,
): MergeResult {
  if (local === external) return { content: local, status: "clean" };
  if (local === base) return { content: external, status: "clean" };
  if (external === base) return { content: local, status: "clean" };

  const localEdit = singleLineEdit(base, local);
  const externalEdit = singleLineEdit(base, external);
  if (!localEdit || !externalEdit) {
    return { reason: "multiple-edits", status: "conflict" };
  }
  if (
    localEdit.start >= externalEdit.end ||
    externalEdit.start >= localEdit.end
  ) {
    const edits = [localEdit, externalEdit].sort(
      (left, right) => right.start - left.start,
    );
    const lines = base.split("\n");
    for (const edit of edits) {
      lines.splice(edit.start, edit.end - edit.start, ...edit.replacement);
    }
    return { content: lines.join("\n"), status: "clean" };
  }
  return { reason: "overlap", status: "conflict" };
}

function singleLineEdit(base: string, variant: string): LineEdit | null {
  const baseLines = base.split("\n");
  const variantLines = variant.split("\n");
  let start = 0;
  while (start < baseLines.length && start < variantLines.length) {
    if (baseLines[start] !== variantLines[start]) break;
    start += 1;
  }

  let baseEnd = baseLines.length;
  let variantEnd = variantLines.length;
  while (
    baseEnd > start &&
    variantEnd > start &&
    baseLines[baseEnd - 1] === variantLines[variantEnd - 1]
  ) {
    baseEnd -= 1;
    variantEnd -= 1;
  }

  return {
    end: baseEnd,
    replacement: variantLines.slice(start, variantEnd),
    start,
  };
}
