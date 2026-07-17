import type { AnchoredDocument } from "../documents";

type StatusBarProps = {
  document?: AnchoredDocument;
  vaultName: string;
};

export function StatusBar({ document, vaultName }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-bar__path">
        <span>{vaultName || "No vault"}</span>
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
          <span aria-hidden="true">•</span>
          <span>Ln 12, Col 1</span>
        </div>
      ) : null}
    </footer>
  );
}
