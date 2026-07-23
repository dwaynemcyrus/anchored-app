const STORAGE_KEY = "anchored.conflict-snapshots.v1";
const MAX_SNAPSHOTS = 20;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;

export type ConflictSnapshot = {
  base: string;
  external: string;
  local: string;
  path: string;
  savedAt: number;
  vaultId: string;
};

export function saveConflictSnapshot(
  storage: Storage,
  snapshot: ConflictSnapshot,
): void {
  if (
    snapshot.base.length > MAX_CONTENT_LENGTH ||
    snapshot.external.length > MAX_CONTENT_LENGTH ||
    snapshot.local.length > MAX_CONTENT_LENGTH
  ) {
    return;
  }
  try {
    const current = loadConflictSnapshots(storage).filter(
      (entry) =>
        entry.vaultId !== snapshot.vaultId || entry.path !== snapshot.path,
    );
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([snapshot, ...current].slice(0, MAX_SNAPSHOTS)),
    );
  } catch {
    // Recovery persistence is best effort; the visible recovery copy remains.
  }
}

export function loadConflictSnapshots(storage: Storage): ConflictSnapshot[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConflictSnapshot).slice(0, MAX_SNAPSHOTS);
  } catch {
    return [];
  }
}

function isConflictSnapshot(value: unknown): value is ConflictSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ConflictSnapshot>;
  return (
    typeof candidate.base === "string" &&
    typeof candidate.external === "string" &&
    typeof candidate.local === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.savedAt === "number" &&
    typeof candidate.vaultId === "string"
  );
}
