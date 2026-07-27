import { buildVaultCollections } from "./collections";
import type { AnchoredDocument } from "./documents";
import type { WorkbenchSort } from "./fileRailPreferences";

export type CollectionId =
  "inbox" | "scratchpad" | "workbench" | "archive" | "assets";

export type NoteListScope =
  { kind: "collection"; id: CollectionId } | { kind: "folder"; path: string };

export const defaultNoteListScope: NoteListScope = {
  kind: "collection",
  id: "inbox",
};

export const collectionLabels: Record<CollectionId, string> = {
  inbox: "Inbox",
  scratchpad: "Scratchpad",
  workbench: "Workbench",
  archive: "Archive",
  assets: "Assets",
};

export function scopeLabel(scope: NoteListScope, vaultName: string): string {
  if (scope.kind === "collection") return collectionLabels[scope.id];
  if (!scope.path) return vaultName || "Vault root";
  return scope.path.split("/").pop() ?? scope.path;
}

export function isSameScope(
  left: NoteListScope,
  right: NoteListScope,
): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "collection"
    ? left.id === (right as { id: CollectionId }).id
    : left.path === (right as { path: string }).path;
}

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareOptionalDates(
  left: string | undefined,
  right: string | undefined,
  direction: 1 | -1,
): number {
  // A note without the date sorts last whichever way the order runs, so a
  // missing timestamp never masquerades as the oldest or the newest note.
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left === right ? 0 : (left < right ? -1 : 1) * direction;
}

export function sortNotes(
  documents: AnchoredDocument[],
  sort: WorkbenchSort,
): AnchoredDocument[] {
  const sorted = [...documents];
  sorted.sort((left, right) => {
    switch (sort) {
      case "name-asc":
        return nameCollator.compare(left.name, right.name);
      case "name-desc":
        return nameCollator.compare(right.name, left.name);
      // The direction is a flag rather than swapped arguments, so the
      // missing-date rule keeps applying to the real left and right and an
      // undated note stays last in both orders.
      case "created-asc":
        return compareOptionalDates(left.createdAt, right.createdAt, 1);
      case "created-desc":
        return compareOptionalDates(left.createdAt, right.createdAt, -1);
      case "modified-asc":
        return (left.modifiedMillis ?? 0) - (right.modifiedMillis ?? 0);
      case "modified-desc":
      default:
        return (right.modifiedMillis ?? 0) - (left.modifiedMillis ?? 0);
    }
  });
  return sorted;
}

/// The notes a scope lists. Folder scopes list the folder's own notes only —
/// descending into subfolders would make the list disagree with the tree the
/// user just clicked in.
export function documentsForScope(
  documents: AnchoredDocument[],
  scope: NoteListScope,
): AnchoredDocument[] {
  if (scope.kind === "folder") {
    return documents.filter(
      (document) =>
        !document.isRecoveryCopy && (document.folderPath ?? "") === scope.path,
    );
  }

  const collections = buildVaultCollections(documents);
  return collections[scope.id];
}
