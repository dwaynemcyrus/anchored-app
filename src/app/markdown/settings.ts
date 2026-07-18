import { DEFAULT_MARKDOWN_SETTINGS, type MarkdownSettings } from "./types";

const STORAGE_KEY = "anchored.markdown-settings.v1";
const STORAGE_VERSION = 1;

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function parseSettings(value: unknown): MarkdownSettings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MarkdownSettings> & { version?: unknown };
  if (
    candidate.version !== STORAGE_VERSION ||
    !isBoolean(candidate.autoLinkUrls) ||
    !isBoolean(candidate.emoji) ||
    !isBoolean(candidate.mermaid) ||
    !isBoolean(candidate.smartTypography) ||
    !isBoolean(candidate.syntaxHighlighting)
  ) {
    return null;
  }
  return {
    autoLinkUrls: candidate.autoLinkUrls,
    emoji: candidate.emoji,
    mermaid: candidate.mermaid,
    smartTypography: candidate.smartTypography,
    syntaxHighlighting: candidate.syntaxHighlighting,
  };
}

export function loadMarkdownSettings(
  storage: SettingsStorage,
): MarkdownSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MARKDOWN_SETTINGS };
    return parseSettings(JSON.parse(raw)) ?? { ...DEFAULT_MARKDOWN_SETTINGS };
  } catch {
    return { ...DEFAULT_MARKDOWN_SETTINGS };
  }
}

export function saveMarkdownSettings(
  storage: SettingsStorage,
  settings: MarkdownSettings,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...settings, version: STORAGE_VERSION }),
    );
  } catch {
    // Markdown settings are optional and must never block the editor.
  }
}

export function markdownSettingsStorageKey(): string {
  return STORAGE_KEY;
}
