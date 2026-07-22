import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  activeAutoPairAt,
  addPairEffect,
  autoPairState,
  emptyPairAt,
  pairClosingAt,
  pairInputAt,
} from "./editorPairs";

describe("Markdown editor pairs", () => {
  it("creates the supported pairs with the caret inside", () => {
    expect(pairInputAt("", 0, "`")).toMatchObject({
      close: "`",
      insert: "``",
      selection: 1,
    });
    expect(pairInputAt("[", 1, "[")).toMatchObject({
      close: "]]",
      insert: "[]]",
      open: "[[",
      selection: 2,
    });
    expect(pairInputAt("*", 1, "*")).toMatchObject({
      close: "**",
      insert: "***",
      open: "**",
      selection: 2,
    });
    expect(pairInputAt("_", 1, "_")).toMatchObject({
      close: "__",
      insert: "___",
      open: "__",
      selection: 2,
    });
    expect(pairInputAt("~", 1, "~")).toMatchObject({
      close: "~~",
      insert: "~~~",
      open: "~~",
      selection: 2,
    });
  });

  it("does not pair escaped syntax, code, fenced code, or indented code", () => {
    expect(pairInputAt("\\[", 2, "[")).toBeNull();
    expect(pairInputAt("`code*", 6, "*")).toBeNull();
    expect(pairInputAt("```md\n*", 7, "*")).toBeNull();
    expect(pairInputAt("    *", 5, "*")).toBeNull();
    expect(pairInputAt("`", 1, "`")).toBeNull();
  });

  it("tracks an auto-created pair as text is typed inside it", () => {
    let state = EditorState.create({
      doc: "[",
      extensions: [autoPairState],
    });
    const input = pairInputAt("[", 1, "[");
    if (!input) throw new Error("expected wikilink pair input");

    state = state.update({
      changes: { from: 1, insert: input.insert },
      effects: addPairEffect(input),
      selection: { anchor: input.selection },
      userEvent: "input.type",
    }).state;

    expect(state.doc.toString()).toBe("[[]]");
    expect(activeAutoPairAt(state, 2)).toMatchObject({
      close: "]]",
      closeFrom: 2,
      from: 0,
      open: "[[",
    });
    expect(emptyPairAt(state, 2)).not.toBeNull();

    state = state.update({
      changes: { from: 2, insert: "Future" },
      selection: { anchor: 8 },
      userEvent: "input.type",
    }).state;

    expect(state.doc.toString()).toBe("[[Future]]");
    expect(activeAutoPairAt(state, 8)).toMatchObject({ closeFrom: 8 });
    expect(emptyPairAt(state, 8)).toBeNull();
    expect(pairClosingAt(state, 8, "]")).not.toBeNull();

    const prefix = "---\nupdated_at: 2026-07-22T16:00:00+02:00\n---\n\n";
    state = state.update({
      changes: { from: 0, insert: prefix },
      selection: { anchor: prefix.length + 8 },
    }).state;

    expect(activeAutoPairAt(state, prefix.length + 8)).toMatchObject({
      closeFrom: prefix.length + 8,
      from: prefix.length,
    });
  });
});
