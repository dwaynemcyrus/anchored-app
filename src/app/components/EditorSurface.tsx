import type { AnchoredDocument } from "../documents";

type EditorSurfaceProps = {
  document: AnchoredDocument;
  onOpenLinkedDocument: (documentId: string) => void;
};

export function EditorSurface({
  document,
  onOpenLinkedDocument,
}: EditorSurfaceProps) {
  const frontMatter = [
    "---",
    `id: ${
      document.id.startsWith("draft-") ? "Pending save" : "note_01JZQ7K8P4"
    }`,
    `aliases: [${document.aliases.join(", ")}]`,
    `tags: [${document.tags.join(", ")}]`,
    "---",
  ].join("\n");

  return (
    <main className="editor-surface">
      <header className="editor-surface__header">
        <span>{document.folder}</span>
        <span aria-hidden="true">/</span>
        <span>{document.name}</span>
      </header>
      <article
        aria-label={`${document.name} Markdown document`}
        aria-readonly="true"
        className="document"
        role="textbox"
        tabIndex={0}
      >
        <pre className="front-matter">{frontMatter}</pre>
        <h1>{document.title}</h1>
        {document.body.length > 0 ? (
          <p>{document.body}</p>
        ) : (
          <p className="document__empty">Start writing…</p>
        )}
        {document.relatedDocumentId && document.relatedLabel ? (
          <p>
            Related:{" "}
            <button
              className="wikilink"
              type="button"
              onClick={() =>
                onOpenLinkedDocument(document.relatedDocumentId as string)
              }
            >
              [[{document.relatedLabel}]]
            </button>
          </p>
        ) : null}
        <div aria-hidden="true" className="cursor-line">
          <span className="caret" />
        </div>
      </article>
    </main>
  );
}
