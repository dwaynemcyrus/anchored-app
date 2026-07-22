import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  highlightSelectionMatches,
  openSearchPanel,
  searchKeymap,
} from "@codemirror/search";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { type CSSProperties, useEffect, useRef } from "react";

import {
  rankWikilinkCandidates,
  type WikilinkCandidate,
} from "../linkCandidates";
import {
  frontMatterEditorDecorations,
  markdownEditorDecorations,
} from "../markdown/editorDecorations";
import {
  anchoredMarkdownLanguage,
  anchoredMarkdownSyntaxHighlighting,
} from "../markdown/editorLanguage";
import type { EditorFontSize } from "../markdown/types";
import { markdownBodyStart } from "../markdown/source";
import { wikilinkAtOffset, wikilinkCompletionAtOffset } from "../links";
import { describeExternalDocumentChange } from "./editorSync";

export type EditorCursorPosition = {
  line: number;
  column: number;
};

type MarkdownEditorProps = {
  autoFocus?: boolean;
  focusAtBodyStart?: boolean;
  documentId: string;
  editorFontSize: EditorFontSize;
  findRequest: number;
  label: string;
  value: string;
  wikilinkCandidates: WikilinkCandidate[];
  onChange: (content: string) => void;
  onCursorPosition: (position: EditorCursorPosition) => void;
  onOpenWikilink: (target: string) => void;
  onPreview: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export default function MarkdownEditor({
  autoFocus = false,
  focusAtBodyStart = false,
  documentId,
  editorFontSize,
  findRequest,
  label,
  value,
  wikilinkCandidates,
  onChange,
  onCursorPosition,
  onOpenWikilink,
  onPreview,
  onSave,
  onSaveAs,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onOpenWikilinkRef = useRef(onOpenWikilink);
  const onPreviewRef = useRef(onPreview);
  const onSaveRef = useRef(onSave);
  const onSaveAsRef = useRef(onSaveAs);
  const wikilinkCandidatesRef = useRef(wikilinkCandidates);
  const onCursorPositionRef = useRef(onCursorPosition);
  const syncingValueRef = useRef(false);
  const composingRef = useRef(false);
  const localValueHistoryRef = useRef(new Set([value]));
  const bodyFocusAppliedRef = useRef(false);

  valueRef.current = value;
  onChangeRef.current = onChange;
  onOpenWikilinkRef.current = onOpenWikilink;
  onPreviewRef.current = onPreview;
  onSaveRef.current = onSave;
  onSaveAsRef.current = onSaveAs;
  wikilinkCandidatesRef.current = wikilinkCandidates;
  onCursorPositionRef.current = onCursorPosition;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    bodyFocusAppliedRef.current = false;

    function completeWikilink(
      context: CompletionContext,
    ): CompletionResult | null {
      const partial = wikilinkCompletionAtOffset(
        context.state.doc.toString(),
        context.pos,
      );
      if (!partial) return null;
      const candidates = rankWikilinkCandidates(
        wikilinkCandidatesRef.current,
        partial.query,
        documentId,
      );
      if (candidates.length === 0) return null;

      return {
        filter: false,
        from: partial.from,
        options: candidates.map((candidate) => ({
          apply: (editor, _completion, from, to) => {
            const inserted = `${candidate.target}]]`;
            editor.dispatch({
              changes: { from, insert: inserted, to },
              selection: {
                anchor: from + inserted.length,
                head: from + inserted.length,
              },
            });
          },
          detail: candidate.detail,
          displayLabel: candidate.label,
          label: candidate.target,
        })),
        // Rerank synchronously as the query grows instead of briefly showing
        // stale recent-note results while a new async query is scheduled.
        update: (_current, _from, _to, nextContext) =>
          completeWikilink(nextContext),
      };
    }

    function syncExternalValue(view: EditorView): void {
      const current = view.state.doc.toString();
      const next = valueRef.current;
      if (current === next || composingRef.current) return;

      const currentSelection = view.state.selection.main;
      const sync = describeExternalDocumentChange(current, next, {
        anchor: currentSelection.anchor,
        head: currentSelection.head,
      });
      if (!sync) return;

      syncingValueRef.current = true;
      view.dispatch({ changes: sync.change, selection: sync.selection });
      syncingValueRef.current = false;
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          anchoredMarkdownLanguage,
          anchoredMarkdownSyntaxHighlighting,
          markdownEditorDecorations,
          frontMatterEditorDecorations,
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          placeholder("Start writing…"),
          autocompletion({
            activateOnTyping: true,
            icons: false,
            interactionDelay: 0,
            maxRenderedOptions: 24,
            override: [completeWikilink],
          }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            {
              key: "Mod-Shift-p",
              run: () => {
                onPreviewRef.current();
                return true;
              },
            },
            {
              key: "Shift-Mod-s",
              run: () => {
                onSaveAsRef.current();
                return true;
              },
            },
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current();
                return true;
              },
            },
          ]),
          EditorView.domEventHandlers({
            compositionstart: () => {
              composingRef.current = true;
              return false;
            },
            compositionend: () => {
              composingRef.current = false;
              syncExternalValue(view);
              return false;
            },
            keydown: (event, editor) => {
              if (
                event.key === "Escape" &&
                event.target instanceof Element &&
                event.target.closest(".cm-search")
              ) {
                window.requestAnimationFrame(() => editor.focus());
                return false;
              }
              if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) {
                return false;
              }
              const link = wikilinkAtOffset(
                editor.state.doc.toString(),
                editor.state.selection.main.head,
              );
              if (!link) return false;
              event.preventDefault();
              onOpenWikilinkRef.current(link.target);
              return true;
            },
            mousedown: (event, editor) => {
              if (event.button !== 0 || (!event.metaKey && !event.ctrlKey)) {
                return false;
              }
              const offset = editor.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
              if (offset === null) return false;
              const link = wikilinkAtOffset(
                editor.state.doc.toString(),
                offset,
              );
              if (!link) return false;
              event.preventDefault();
              onOpenWikilinkRef.current(link.target);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
              const position = update.state.doc.lineAt(
                update.state.selection.main.head,
              );
              onCursorPositionRef.current({
                line: position.number,
                column: update.state.selection.main.head - position.from + 1,
              });
            }
            if (update.docChanged) {
              if (!syncingValueRef.current) {
                const nextValue = update.state.doc.toString();
                localValueHistoryRef.current.add(nextValue);
                if (localValueHistoryRef.current.size > 64) {
                  const oldest = localValueHistoryRef.current
                    .values()
                    .next().value;
                  if (typeof oldest === "string") {
                    localValueHistoryRef.current.delete(oldest);
                  }
                }
                onChangeRef.current(nextValue);
              }
            }
          }),
        ],
      }),
    });
    editorRef.current = view;
    const initialLine = view.state.doc.lineAt(view.state.selection.main.head);
    onCursorPositionRef.current({
      line: initialLine.number,
      column: view.state.selection.main.head - initialLine.from + 1,
    });
    if (autoFocus) view.focus();
    if (focusAtBodyStart) {
      const bodyStart = markdownBodyStart(view.state.doc.toString());
      if (bodyStart !== null) {
        view.dispatch({
          selection: { anchor: bodyStart, head: bodyStart },
        });
        view.focus();
        bodyFocusAppliedRef.current = true;
      }
    }

    return () => {
      editorRef.current = null;
      view.destroy();
    };
  }, [autoFocus, documentId, focusAtBodyStart, label]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    valueRef.current = value;
    if (localValueHistoryRef.current.has(value)) return;
    if (composingRef.current) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    const currentSelection = view.state.selection.main;
    const sync = describeExternalDocumentChange(current, value, {
      anchor: currentSelection.anchor,
      head: currentSelection.head,
    });
    if (!sync) return;

    syncingValueRef.current = true;
    view.dispatch({ changes: sync.change, selection: sync.selection });
    syncingValueRef.current = false;
    localValueHistoryRef.current.clear();
    localValueHistoryRef.current.add(value);

    if (focusAtBodyStart && !bodyFocusAppliedRef.current) {
      const bodyStart = markdownBodyStart(value);
      if (bodyStart !== null) {
        view.dispatch({
          selection: { anchor: bodyStart, head: bodyStart },
        });
        view.focus();
        bodyFocusAppliedRef.current = true;
      }
    }
  }, [focusAtBodyStart, value]);

  useEffect(() => {
    if (findRequest <= 0 || !editorRef.current) return;

    openSearchPanel(editorRef.current);
    const focusFindInput = () => {
      const findInput = hostRef.current?.querySelector<HTMLInputElement>(
        ".cm-search input[main-field], .cm-search input",
      );
      findInput?.focus();
      findInput?.select();
      return Boolean(findInput);
    };
    if (focusFindInput()) return;

    const frame = window.requestAnimationFrame(focusFindInput);
    return () => window.cancelAnimationFrame(frame);
  }, [findRequest]);

  return (
    <div
      className="markdown-editor"
      ref={hostRef}
      style={
        {
          "--anchored-editor-font-size": `${editorFontSize}px`,
        } as CSSProperties
      }
    />
  );
}
