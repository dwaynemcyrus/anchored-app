const STORAGE_KEY = "anchored.session.v1";
const STORAGE_VERSION = 1;

type SessionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type AnchoredSessionState = {
  activeRelativePath?: string;
  vaultId: string;
};

function validOptionalPath(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

export function loadSessionState(
  storage: SessionStorage,
): AnchoredSessionState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as {
      activeRelativePath?: unknown;
      vaultId?: unknown;
      version?: unknown;
    };
    if (
      payload.version !== STORAGE_VERSION ||
      typeof payload.vaultId !== "string" ||
      payload.vaultId.length === 0 ||
      !validOptionalPath(payload.activeRelativePath)
    ) {
      return null;
    }
    return {
      activeRelativePath: payload.activeRelativePath,
      vaultId: payload.vaultId,
    };
  } catch {
    return null;
  }
}

export function saveSessionState(
  storage: SessionStorage,
  state: AnchoredSessionState,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, version: STORAGE_VERSION }),
    );
  } catch {
    // Session restore is optional and must never block the editor.
  }
}

export function clearSessionState(storage: SessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Session restore is optional and must never block the editor.
  }
}
