import type { AnchoredDocument } from "../documents";

type StatusBarProps = {
  document: AnchoredDocument;
};

export function StatusBar({ document }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-bar__path">
        <span>Personal</span>
        <span aria-hidden="true">›</span>
        <span>{document.folder}</span>
        <span aria-hidden="true">›</span>
        <span>{document.name}</span>
      </div>
      <div className="status-bar__metadata">
        <span>Markdown</span>
        <span aria-hidden="true">•</span>
        <span>UTF-8</span>
        <span aria-hidden="true">•</span>
        <span>Ln 12, Col 1</span>
      </div>
    </footer>
  );
}
