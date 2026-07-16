import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";

import { wikilinkAtOffset } from "../links";

type MarkdownEditorProps = {
  documentId: string;
  label: string;
  value: string;
  onChange: (content: string) => void;
  onOpenWikilink: (target: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export default function MarkdownEditor({
  documentId,
  label,
  value,
  onChange,
  onOpenWikilink,
  onSave,
  onSaveAs,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onOpenWikilinkRef = useRef(onOpenWikilink);
  const onSaveRef = useRef(onSave);
  const onSaveAsRef = useRef(onSaveAs);

  valueRef.current = value;
  onChangeRef.current = onChange;
  onOpenWikilinkRef.current = onOpenWikilink;
  onSaveRef.current = onSave;
  onSaveAsRef.current = onSaveAs;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          history(),
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          placeholder("Start writing…"),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
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

    return () => view.destroy();
  }, [documentId, label]);

  return <div className="markdown-editor" ref={hostRef} />;
}
