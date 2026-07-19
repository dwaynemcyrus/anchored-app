export type FileRailMode = "collections" | "files";
export type AssetListMode = "grouped" | "alphabetical";
export type WorkbenchListMode = "flat" | "grouped";
export type WorkbenchSort =
  | "name-asc"
  | "name-desc"
  | "modified-desc"
  | "modified-asc"
  | "created-desc"
  | "created-asc";

export type FileRailPreferences = {
  assetListMode: AssetListMode;
  mode: FileRailMode;
  workbenchListMode: WorkbenchListMode;
  workbenchSort: WorkbenchSort;
};

const STORAGE_KEY = "anchored.file-rail.v1";
const STORAGE_VERSION = 2;

export const defaultFileRailPreferences: FileRailPreferences = {
  assetListMode: "grouped",
  mode: "collections",
  workbenchListMode: "flat",
  workbenchSort: "modified-desc",
};

function workbenchSort(value: unknown): WorkbenchSort {
  return value === "name-asc" ||
    value === "name-desc" ||
    value === "modified-desc" ||
    value === "modified-asc" ||
    value === "created-desc" ||
    value === "created-asc"
    ? value
    : "modified-desc";
}

export function loadFileRailPreferences(
  storage: Pick<Storage, "getItem">,
): FileRailPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultFileRailPreferences;
    const value = JSON.parse(raw) as Partial<FileRailPreferences> & {
      version?: number;
    };
    if (value.version !== 1 && value.version !== STORAGE_VERSION) {
      return defaultFileRailPreferences;
    }
    return {
      assetListMode:
        value.assetListMode === "alphabetical" ? "alphabetical" : "grouped",
      mode: value.mode === "files" ? "files" : "collections",
      workbenchListMode:
        value.version === STORAGE_VERSION &&
        value.workbenchListMode === "grouped"
          ? "grouped"
          : "flat",
      workbenchSort:
        value.version === STORAGE_VERSION
          ? workbenchSort(value.workbenchSort)
          : "modified-desc",
    };
  } catch {
    return defaultFileRailPreferences;
  }
}

export function saveFileRailPreferences(
  storage: Pick<Storage, "setItem">,
  preferences: FileRailPreferences,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...preferences, version: STORAGE_VERSION }),
    );
  } catch {
    // Sidebar preferences are optional and must never block navigation.
  }
}
