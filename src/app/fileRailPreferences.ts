export type FileRailMode = "collections" | "files";
export type AssetListMode = "grouped" | "alphabetical";

export type FileRailPreferences = {
  assetListMode: AssetListMode;
  mode: FileRailMode;
};

const STORAGE_KEY = "anchored.file-rail.v1";
const STORAGE_VERSION = 1;

export const defaultFileRailPreferences: FileRailPreferences = {
  assetListMode: "grouped",
  mode: "collections",
};

export function loadFileRailPreferences(
  storage: Pick<Storage, "getItem">,
): FileRailPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultFileRailPreferences;
    const value = JSON.parse(raw) as Partial<FileRailPreferences> & {
      version?: number;
    };
    if (value.version !== STORAGE_VERSION) return defaultFileRailPreferences;
    return {
      assetListMode:
        value.assetListMode === "alphabetical" ? "alphabetical" : "grouped",
      mode: value.mode === "files" ? "files" : "collections",
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
