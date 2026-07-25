import { useRef } from "react";

import type { NoteVersion, VaultConflict } from "../../lib/tauri/vault";
import { useModalDialog } from "./useModalDialog";

type RecoveryPanelProps = {
  conflicts: VaultConflict[];
  versions: NoteVersion[];
  /** The note whose history is shown, if a note is open. */
  versionsFor?: string;
  error?: string;
  loading: boolean;
  onClose: () => void;
};

function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

/** Plain words for where a change came from — the stored values are not
 * something to show a reader. */
function describeOrigin(origin: string): string {
  switch (origin) {
    case "anchored":
      return "Changed in Anchored";
    case "external_file":
      return "Changed outside Anchored";
    default:
      return "Changed";
  }
}

/**
 * The first line of the note's body.
 *
 * Front matter is skipped as a block rather than line by line: skipping only
 * the `---` delimiters would summarise a note as `id: 019f989c…`, which tells
 * a reader nothing about which version they are looking at.
 */
function summarize(content: string): string {
  const lines = content.split("\n");
  let index = 0;
  if (lines[0]?.trim() === "---") {
    index = 1;
    while (index < lines.length && lines[index]?.trim() !== "---") index += 1;
    index += 1;
  }
  const firstLine =
    lines
      .slice(index)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export function RecoveryPanel({
  conflicts,
  versions,
  versionsFor,
  error,
  loading,
  onClose,
}: RecoveryPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLElement>({
    initialFocusRef: closeButtonRef,
    onClose,
  });

  return (
    <aside
      ref={dialogRef}
      aria-label="Recovery"
      aria-modal="true"
      className="continuity-panel"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <header className="continuity-panel__header">
        <div>
          <h2>Recovery</h2>
          <p>
            Earlier versions of your notes, and anything Anchored could not
            resolve on its own.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close Recovery"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="continuity-panel__body">
        {loading ? <p className="continuity-panel__empty">Loading…</p> : null}
        {error ? (
          <p className="continuity-panel__error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <>
            <section aria-labelledby="recovery-conflicts">
              <h3 id="recovery-conflicts">Needs your decision</h3>
              {conflicts.length === 0 ? (
                <p className="continuity-panel__empty">
                  Nothing is waiting on you.
                </p>
              ) : (
                <ol className="continuity-list">
                  {conflicts.map((conflict) => (
                    <li className="continuity-record" key={conflict.uuid}>
                      <div className="continuity-record__copy">
                        <strong>{conflict.name}</strong>
                        <span>
                          Changed both in Anchored and on disk. Both versions
                          are kept — nothing was overwritten.
                        </span>
                        <time
                          dateTime={new Date(
                            conflict.detectedMillis,
                          ).toISOString()}
                        >
                          Noticed {formatWhen(conflict.detectedMillis)}
                        </time>
                      </div>
                      <div className="continuity-record__copy">
                        {/* Shown as paths rather than buttons: the copies sit
                            in the vault's hidden folder, which Anchored does
                            not open as notes. Naming them lets the reader find
                            them without a control that would fail. */}
                        <span>
                          Anchored&rsquo;s copy:{" "}
                          <code>{conflict.databaseCopyPath}</code>
                        </span>
                        <span>
                          The copy on disk: <code>{conflict.fileCopyPath}</code>
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby="recovery-versions">
              <h3 id="recovery-versions">
                {versionsFor
                  ? `Earlier versions of ${versionsFor}`
                  : "Earlier versions"}
              </h3>
              {!versionsFor ? (
                <p className="continuity-panel__empty">
                  Open a note to see the versions kept for it.
                </p>
              ) : versions.length === 0 ? (
                <p className="continuity-panel__empty">
                  No earlier versions kept yet. One is saved each time this
                  note&rsquo;s contents are replaced.
                </p>
              ) : (
                <ol className="continuity-list">
                  {versions.map((version) => (
                    <li
                      className="continuity-record"
                      key={`${version.revision}-${version.createdMillis}`}
                    >
                      <div className="continuity-record__copy">
                        <strong>{describeOrigin(version.origin)}</strong>
                        <span>
                          {summarize(version.content) || "Empty note"}
                        </span>
                        <time
                          dateTime={new Date(
                            version.createdMillis,
                          ).toISOString()}
                        >
                          {formatWhen(version.createdMillis)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
