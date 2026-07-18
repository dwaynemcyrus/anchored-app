import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import {
  highlightSelectionMatches,
  openSearchPanel,
  searchKeymap,
} from "@codemirror/search";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";

import {
  rankWikilinkCandidates,
  type WikilinkCandidate,
} from "../linkCandidates";
import { markdownEditorDecorations } from "../markdown/editorDecorations";
import { wikilinkAtOffset, wikilinkCompletionAtOffset } from "../links";

type MarkdownEditorProps = {
  autoFocus?: boolean;
  documentId: string;
  findRequest: number;
  label: string;
  value: string;
  wikilinkCandidates: WikilinkCandidate[];
  onChange: (content: string) => void;
  onOpenWikilink: (target: string) => void;
  onPreview: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export default function MarkdownEditor({
  autoFocus = false,
  documentId,
  findRequest,
  label,
  value,
  wikilinkCandidates,
  onChange,
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

  valueRef.current = value;
  onChangeRef.current = onChange;
  onOpenWikilinkRef.current = onOpenWikilink;
  onPreviewRef.current = onPreview;
  onSaveRef.current = onSave;
  onSaveAsRef.current = onSaveAs;
  wikilinkCandidatesRef.current = wikilinkCandidates;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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
              selection: { anchor: from + inserted.length },
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

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          markdown(),
          markdownEditorDecorations,
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
            keydown: (event, editor) => {
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
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    editorRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      editorRef.current = null;
      view.destroy();
    };
  }, [autoFocus, documentId, label]);

  useEffect(() => {
    if (findRequest > 0 && editorRef.current) {
      openSearchPanel(editorRef.current);
      const findInput = hostRef.current?.querySelector<HTMLInputElement>(
        ".cm-search [main-field]",
      );
      findInput?.focus();
      findInput?.select();
    }
  }, [findRequest]);

  return <div className="markdown-editor" ref={hostRef} />;
}
