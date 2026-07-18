import { lazy, Suspense, useState } from "react";

import type { AnchoredDocument } from "../documents";
import type { WikilinkCandidate } from "../linkCandidates";
import type { MarkdownSettings } from "../markdown/types";
import { Backlinks } from "./Backlinks";

const MarkdownEditor = lazy(() => import("./MarkdownEditor"));
const MarkdownPreview = lazy(() => import("./MarkdownPreview"));

type EditorSurfaceProps = {
  document?: AnchoredDocument;
  findRequest: number;
  backlinks: AnchoredDocument[];
  hasDocuments: boolean;
  loadState:
    | { status: "idle" }
    | { status: "loading"; documentId: string }
    | { status: "error"; documentId: string; message: string };
  vaultName: string;
  vaultSelected: boolean;
  wikilinkCandidates: WikilinkCandidate[];
  onCloseDocument: () => void;
  onCreateVault: () => void;
  onDocumentChange: (content: string) => void;
  onOpenLinkedDocument: (documentId: string) => void;
  onOpenVault: () => void;
  onOpenMoveDocument: () => void;
  onOpenWikilink: (target: string) => void;
  onRetryDocument: () => void;
  onRenameDocument: () => void;
  onSaveDocument: () => void;
  onSaveDocumentAs: () => void;
  onTrashDocument: () => void;
  moving: boolean;
  markdownSettings: MarkdownSettings;
  renaming: boolean;
  trashing: boolean;
};

export function EditorSurface({
  document,
  findRequest,
  backlinks,
  hasDocuments,
  loadState,
  vaultName,
  vaultSelected,
  wikilinkCandidates,
  onCloseDocument,
  onCreateVault,
  onDocumentChange,
  onOpenLinkedDocument,
  onOpenMoveDocument,
  onOpenVault,
  onOpenWikilink,
  onRetryDocument,
  onRenameDocument,
  onSaveDocument,
  onSaveDocumentAs,
  onTrashDocument,
  moving,
  markdownSettings,
  renaming,
  trashing,
}: EditorSurfaceProps) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [focusEditorOnOpen, setFocusEditorOnOpen] = useState(false);
  if (!document) {
    return (
      <main className="editor-surface">
        <header className="editor-surface__header">
          {vaultSelected ? vaultName : "Open a vault to begin"}
        </header>
        <section className="document document--empty">
          <h1>
            {!vaultSelected
              ? "No vault open"
              : hasDocuments
                ? "No note open"
                : "No Markdown notes"}
          </h1>
          <p>
            {!vaultSelected
              ? "Choose Open vault, then select a folder containing Markdown files."
              : hasDocuments
                ? "Choose a note from the file explorer."
                : "Choose another vault to continue."}
          </p>
          {!vaultSelected ? (
            <div className="document__empty-actions">
              <button type="button" onClick={onOpenVault}>
                Open a vault
              </button>
              <button type="button" onClick={onCreateVault}>
                Create a vault
              </button>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  const frontMatter = [
    "---",
    `id: ${
      document.id.startsWith("draft-")
        ? "Pending save"
        : "01JZQ7K8P4A6F2M9V3C5T7X1BY"
    }`,
    `aliases: [${document.aliases.join(", ")}]`,
    `tags: [${document.tags.join(", ")}]`,
    "---",
  ].join("\n");

  return (
    <main className="editor-surface">
      <header className="editor-surface__header">
        <span className="editor-surface__path">
          <span>{document.folder}</span>
          <span aria-hidden="true">/</span>
          <span>{document.name}</span>
        </span>
        <div className="editor-surface__actions">
          {document.relativePath && document.id.startsWith("vault-id:") ? (
            <button
              aria-label={`Move ${document.name}`}
              className="editor-surface__action"
              disabled={
                moving ||
                renaming ||
                trashing ||
                document.saveState !== "saved" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={onOpenMoveDocument}
            >
              {moving ? "Moving…" : "Move"}
            </button>
          ) : null}
          {document.relativePath && document.id.startsWith("vault-id:") ? (
            <button
              aria-label={`Rename ${document.name}`}
              className="editor-surface__action"
              disabled={
                moving ||
                renaming ||
                document.saveState !== "saved" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={onRenameDocument}
            >
              {renaming ? "Renaming…" : "Rename"}
            </button>
          ) : null}
          {document.sourceText !== undefined ? (
            <button
              aria-pressed={previewVisible}
              className="editor-surface__action"
              type="button"
              onClick={() => {
                const nextVisible = !previewVisible;
                setPreviewVisible(nextVisible);
                setFocusEditorOnOpen(!nextVisible);
              }}
            >
              {previewVisible ? "Edit source" : "Preview"}
            </button>
          ) : null}
          {document.sourceText !== undefined ? (
            <button
              aria-label={`Save ${document.name} as`}
              className="editor-surface__action"
              disabled={moving || renaming || trashing}
              type="button"
              onClick={onSaveDocumentAs}
            >
              Save as
            </button>
          ) : null}
          {document.relativePath && document.id.startsWith("vault-id:") ? (
            <button
              aria-label={`Move ${document.name} to Trash`}
              className="editor-surface__action"
              disabled={
                moving ||
                renaming ||
                trashing ||
                document.saveState !== "saved" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={onTrashDocument}
            >
              {trashing ? "Moving…" : "Trash"}
            </button>
          ) : null}
          <button
            aria-label={`Close ${document.name}`}
            className="editor-surface__action"
            disabled={moving || renaming || trashing}
            type="button"
            onClick={onCloseDocument}
          >
            Close
          </button>
        </div>
      </header>
      <section className="document">
        {document.relativePath && document.sourceText === undefined ? (
          loadState.status === "loading" ? (
            <p className="document__empty" role="status">
              Opening Markdown…
            </p>
          ) : loadState.status === "error" ? (
            <div className="document__error" role="alert">
              <h1>Could not open this note</h1>
              <p>{loadState.message}</p>
              <button
                className="wikilink"
                type="button"
                onClick={onRetryDocument}
              >
                Try again
              </button>
            </div>
          ) : null
        ) : document.sourceText !== undefined ? (
          previewVisible ? (
            <Suspense
              fallback={
                <p className="document__empty" role="status">
                  Opening Preview…
                </p>
              }
            >
              <MarkdownPreview
                label={`${document.name} Markdown preview`}
                onOpenWikilink={onOpenWikilink}
                settings={markdownSettings}
                source={document.sourceText}
              />
            </Suspense>
          ) : (
            <Suspense
              fallback={
                <p className="document__empty" role="status">
                  Opening editor…
                </p>
              }
            >
              <MarkdownEditor
                autoFocus={focusEditorOnOpen}
                documentId={document.id}
                findRequest={findRequest}
                label={`${document.name} Markdown editor`}
                value={document.sourceText}
                wikilinkCandidates={wikilinkCandidates}
                onChange={onDocumentChange}
                onOpenWikilink={onOpenWikilink}
                onPreview={() => setPreviewVisible(true)}
                onSave={onSaveDocument}
                onSaveAs={onSaveDocumentAs}
              />
            </Suspense>
          )
        ) : (
          <>
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
          </>
        )}
        <Backlinks documents={backlinks} onOpen={onOpenLinkedDocument} />
      </section>
    </main>
  );
}
