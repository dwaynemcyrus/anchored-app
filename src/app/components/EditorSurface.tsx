import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { AnchoredDocument } from "../documents";
import { displayFileName } from "../fileTypes";
import type { WikilinkCandidate } from "../linkCandidates";
import type { MarkdownSettings } from "../markdown/types";
import { Backlinks } from "./Backlinks";
import type { EditorCursorPosition } from "./MarkdownEditor";

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
  lifecycleChanging: boolean;
  onArchiveDocument: () => void;
  onCloseDocument: () => void;
  onCreateVault: () => void;
  onDocumentChange: (content: string) => void;
  onCursorPosition: (position: EditorCursorPosition) => void;
  onOpenLinkedDocument: (documentId: string) => void;
  onOpenVault: () => void;
  onOpenMoveDocument: () => void;
  onOpenWikilink: (target: string) => void;
  onRetryDocument: () => void;
  onRenameDocument: (name: string) => void;
  onRestoreDocument: (destinationStatus: "active" | "inbox") => void;
  onSaveDocument: () => void;
  onSaveDocumentAs: () => void;
  onTrashDocument: () => void;
  focusDocumentId?: string;
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
  lifecycleChanging,
  onArchiveDocument,
  onCloseDocument,
  onCreateVault,
  onDocumentChange,
  onCursorPosition,
  onOpenLinkedDocument,
  onOpenMoveDocument,
  onOpenVault,
  onOpenWikilink,
  onRetryDocument,
  onRenameDocument,
  onRestoreDocument,
  onSaveDocument,
  onSaveDocumentAs,
  onTrashDocument,
  focusDocumentId,
  moving,
  markdownSettings,
  renaming,
  trashing,
}: EditorSurfaceProps) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(document?.name ?? "");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const submittedNameRef = useRef<string | undefined>(undefined);
  const skipRenameBlurRef = useRef(false);
  const documentName = document?.name;

  useEffect(() => {
    const startRename = () => setEditingName(true);
    window.addEventListener("anchored:begin-rename", startRename);
    return () =>
      window.removeEventListener("anchored:begin-rename", startRename);
  }, []);

  useEffect(() => {
    setDraftName(
      documentName
        ? displayFileName(documentName, markdownSettings.showFileExtensions)
        : "",
    );
    setEditingName(false);
    submittedNameRef.current = undefined;
  }, [document?.id, documentName, markdownSettings.showFileExtensions]);

  useEffect(() => {
    if (!editingName) return;
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }, [editingName]);

  function beginRename() {
    if (!document?.relativePath || renaming) return;
    skipRenameBlurRef.current = false;
    setDraftName(
      displayFileName(document.name, markdownSettings.showFileExtensions),
    );
    submittedNameRef.current = undefined;
    setEditingName(true);
  }

  function submitRename(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!document) return;
    const name = draftName.trim();
    const currentName = displayFileName(
      document.name,
      markdownSettings.showFileExtensions,
    );
    if (!name || name === currentName) {
      setDraftName(currentName);
      setEditingName(false);
      submittedNameRef.current = undefined;
      return;
    }
    if (submittedNameRef.current === name) return;
    submittedNameRef.current = name;
    onRenameDocument(name);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    skipRenameBlurRef.current = true;
    const currentName = document
      ? displayFileName(document.name, markdownSettings.showFileExtensions)
      : "";
    setDraftName(currentName);
    setEditingName(false);
    submittedNameRef.current = undefined;
  }

  useEffect(() => {
    const showPreview = () => setPreviewVisible(true);
    window.addEventListener("anchored:show-preview", showPreview);
    return () =>
      window.removeEventListener("anchored:show-preview", showPreview);
  }, []);

  useEffect(() => {
    const startRename = () => setEditingName(true);
    window.addEventListener("anchored:begin-rename", startRename);
    return () =>
      window.removeEventListener("anchored:begin-rename", startRename);
  }, []);

  useEffect(() => {
    setDraftName(
      documentName
        ? displayFileName(documentName, markdownSettings.showFileExtensions)
        : "",
    );
    setEditingName(false);
    submittedNameRef.current = undefined;
  }, [document?.id, documentName, markdownSettings.showFileExtensions]);

  useEffect(() => {
    if (!editingName) return;
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }, [editingName]);

  function beginRename() {
    if (!document?.relativePath || renaming) return;
    setDraftName(
      displayFileName(document.name, markdownSettings.showFileExtensions),
    );
    submittedNameRef.current = undefined;
    setEditingName(true);
  }

  function submitRename(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!document) return;
    const name = draftName.trim();
    if (submittedNameRef.current === name) return;
    submittedNameRef.current = name;
    onRenameDocument(name);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setEditingName(false);
    submittedNameRef.current = undefined;
  }
  const [focusEditorOnOpen, setFocusEditorOnOpen] = useState(false);
  const displayName = document
    ? displayFileName(document.name, markdownSettings.showFileExtensions)
    : "";
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

  if (document.isMarkdown === false) {
    return (
      <main className="editor-surface">
        <header className="editor-surface__header">{vaultName}</header>
        <section className="document document--empty">
          <h1>{displayName}</h1>
          <p>
            This file type is recognized in the tree but is not editable in
            Anchored yet.
          </p>
        </section>
      </main>
    );
  }

  const archived = document.status?.trim().toLocaleLowerCase() === "archived";

  const frontMatter = [
    "---",
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
          {editingName ? (
            <form onSubmit={submitRename}>
              <input
                ref={nameInputRef}
                aria-label={`Edit filename: ${displayName}`}
                autoComplete="off"
                className="editor-surface__filename-input"
                disabled={renaming}
                type="text"
                value={draftName}
                onBlur={() => {
                  if (skipRenameBlurRef.current) {
                    skipRenameBlurRef.current = false;
                    return;
                  }
                  submitRename();
                }}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  submittedNameRef.current = undefined;
                }}
                onKeyDown={handleNameKeyDown}
              />
            </form>
          ) : (
            <button
              aria-label={`Edit filename: ${displayName}`}
              className="editor-surface__filename"
              disabled={
                moving ||
                lifecycleChanging ||
                renaming ||
                trashing ||
                document.saveState === "saving" ||
                document.saveState === "conflict" ||
                document.saveState === "error" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={beginRename}
            >
              {displayName}
            </button>
          )}
        </span>
        <div className="editor-surface__actions">
          {document.relativePath && !archived ? (
            <button
              aria-label={`Move ${displayName}`}
              className="editor-surface__action"
              disabled={
                moving ||
                lifecycleChanging ||
                renaming ||
                trashing ||
                document.saveState === "saving" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={onOpenMoveDocument}
            >
              {moving ? "Moving…" : "Move"}
            </button>
          ) : null}
          {document.relativePath && !archived ? (
            <button
              aria-label={`Rename ${displayName}`}
              className="editor-surface__action"
              disabled={
                moving ||
                lifecycleChanging ||
                renaming ||
                document.saveState === "saving" ||
                document.saveState === "conflict" ||
                document.saveState === "error" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={beginRename}
            >
              {renaming ? "Renaming…" : "Rename"}
            </button>
          ) : null}
          {document.sourceText !== undefined && !archived ? (
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
          {document.sourceText !== undefined && !archived ? (
            <button
              aria-label={`Save ${displayName} as`}
              className="editor-surface__action"
              disabled={moving || lifecycleChanging || renaming || trashing}
              type="button"
              onClick={onSaveDocumentAs}
            >
              Save as
            </button>
          ) : null}
          {document.relativePath && !archived ? (
            <button
              aria-label={`Archive ${displayName}`}
              className="editor-surface__action"
              disabled={
                lifecycleChanging ||
                moving ||
                renaming ||
                trashing ||
                document.saveState !== "saved" ||
                loadState.status === "loading"
              }
              type="button"
              onClick={onArchiveDocument}
            >
              {lifecycleChanging ? "Archiving…" : "Archive"}
            </button>
          ) : null}
          {document.relativePath && archived ? (
            <>
              <button
                className="editor-surface__action"
                disabled={lifecycleChanging || trashing}
                type="button"
                onClick={() => onRestoreDocument("inbox")}
              >
                {lifecycleChanging ? "Restoring…" : "Restore to Inbox"}
              </button>
              <button
                className="editor-surface__action"
                disabled={lifecycleChanging || trashing}
                type="button"
                onClick={() => onRestoreDocument("active")}
              >
                Restore to Workbench
              </button>
            </>
          ) : null}
          {document.relativePath &&
          !archived &&
          document.status?.trim().toLocaleLowerCase() !== "inbox" ? (
            <button
              className="editor-surface__action"
              disabled={lifecycleChanging || trashing}
              type="button"
              onClick={() => onRestoreDocument("inbox")}
            >
              {lifecycleChanging ? "Moving…" : "Move to Inbox"}
            </button>
          ) : null}
          {document.relativePath ? (
            <button
              aria-label={`Move ${displayName} to Trash`}
              className="editor-surface__action"
              disabled={
                moving ||
                lifecycleChanging ||
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
            aria-label={`Close ${displayName}`}
            className="editor-surface__action"
            disabled={moving || lifecycleChanging || renaming || trashing}
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
          archived || previewVisible ? (
            <Suspense
              fallback={
                <p className="document__empty" role="status">
                  Opening Preview…
                </p>
              }
            >
              <MarkdownPreview
                label={`${displayName} Markdown preview`}
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
                autoFocus={focusEditorOnOpen || focusDocumentId === document.id}
                documentId={document.id}
                editorFontSize={markdownSettings.editorFontSize}
                editorLineLength={markdownSettings.editorLineLength}
                findRequest={findRequest}
                focusAtBodyStart={focusDocumentId === document.id}
                label={`${displayName} Markdown editor`}
                value={document.sourceText}
                wikilinkCandidates={wikilinkCandidates}
                onChange={onDocumentChange}
                onCursorPosition={onCursorPosition}
                onOpenWikilink={onOpenWikilink}
                onPreview={() => setPreviewVisible(true)}
                onSave={onSaveDocument}
                onSaveAs={onSaveDocumentAs}
                placeCursorAfterFrontMatter={document.id.startsWith("draft-")}
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
        <Backlinks
          documents={backlinks}
          onOpen={onOpenLinkedDocument}
          showFileExtensions={markdownSettings.showFileExtensions}
        />
      </section>
    </main>
  );
}
