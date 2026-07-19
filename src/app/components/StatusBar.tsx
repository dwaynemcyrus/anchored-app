import type { AnchoredDocument } from "../documents";
import type { EditorCursorPosition } from "./MarkdownEditor";

type StatusBarProps = {
  document?: AnchoredDocument;
  cursorPosition?: EditorCursorPosition;
  vaultFileCount?: number;
  vaultName: string;
};

function localTimestamp(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toLocaleString();
}

export function StatusBar({
  document,
  cursorPosition,
  vaultFileCount,
  vaultName,
}: StatusBarProps) {
  const vaultFileLabel =
    vaultFileCount === undefined
      ? ""
      : vaultFileCount === 1
        ? "1 Markdown file"
        : `${vaultFileCount} Markdown files`;
  const timestamps = document
    ? [
        ["Created", document.createdAt] as const,
        ["Updated", document.updatedAt] as const,
        ["Archived", document.archivedAt] as const,
      ].flatMap(([label, value]) => {
        const local = value ? localTimestamp(value) : undefined;
        return local ? [{ label, local, value }] : [];
      })
    : [];

  return (
    <footer className="status-bar">
      <div className="status-bar__path">
        <span>{vaultName || "No vault"}</span>
        {vaultFileCount !== undefined ? (
          <span className="status-bar__vault-count">{vaultFileLabel}</span>
        ) : null}
        {document ? (
          <>
            <span aria-hidden="true">›</span>
            <span>{document.folder}</span>
            <span aria-hidden="true">›</span>
            <span>{document.name}</span>
          </>
        ) : null}
      </div>
      {document ? (
        <div className="status-bar__metadata">
          <span>Markdown</span>
          <span aria-hidden="true">•</span>
          <span>UTF-8</span>
          {timestamps.map((timestamp) => (
            <span key={timestamp.label}>
              <span aria-hidden="true">•</span>{" "}
              <time
                dateTime={timestamp.value}
                title={`${timestamp.label} ${timestamp.local}`}
              >
                {timestamp.label} {timestamp.local}
              </time>
            </span>
          ))}
          <span aria-hidden="true">•</span>
          <span>
            Ln {cursorPosition?.line ?? 1}, Col {cursorPosition?.column ?? 1}
          </span>
        </div>
      ) : null}
    </footer>
  );
}
