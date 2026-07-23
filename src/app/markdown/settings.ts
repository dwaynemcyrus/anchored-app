import {
  DEFAULT_MARKDOWN_SETTINGS,
  type EditorFontSize,
  type EditorLineLength,
  type MarkdownSettings,
} from "./types";
import { isThemeId } from "../theme/types";

const STORAGE_KEY = "anchored.markdown-settings.v1";
const STORAGE_VERSION = 5;

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isEditorFontSize(value: unknown): value is EditorFontSize {
  return value === 12 || value === 14 || value === 16;
}

function isEditorLineLength(value: unknown): value is EditorLineLength {
  return value === 48 || value === 56 || value === 64 || value === 72;
}

function parseSettings(value: unknown): MarkdownSettings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MarkdownSettings> & { version?: unknown };
  if (
    (candidate.version !== 1 &&
      candidate.version !== 2 &&
      candidate.version !== 3 &&
      candidate.version !== 4 &&
      candidate.version !== STORAGE_VERSION) ||
    !isBoolean(candidate.autoLinkUrls) ||
    !isBoolean(candidate.emoji) ||
    !isBoolean(candidate.mermaid) ||
    !isBoolean(candidate.smartTypography) ||
    !isBoolean(candidate.syntaxHighlighting) ||
    (candidate.version === STORAGE_VERSION &&
      !isEditorFontSize(candidate.editorFontSize)) ||
    (candidate.version === STORAGE_VERSION &&
      !isEditorLineLength(candidate.editorLineLength)) ||
    ((candidate.version === 4 || candidate.version === STORAGE_VERSION) &&
      !isBoolean(candidate.updateTypeOnExternalMove)) ||
    (candidate.theme !== undefined && !isThemeId(candidate.theme))
  ) {
    return null;
  }
  const editorFontSize =
    candidate.version === 1 || !isEditorFontSize(candidate.editorFontSize)
      ? DEFAULT_MARKDOWN_SETTINGS.editorFontSize
      : candidate.editorFontSize;
  return {
    autoLinkUrls: candidate.autoLinkUrls,
    editorFontSize,
    editorLineLength:
      candidate.version === STORAGE_VERSION &&
      isEditorLineLength(candidate.editorLineLength)
        ? candidate.editorLineLength
        : DEFAULT_MARKDOWN_SETTINGS.editorLineLength,
    emoji: candidate.emoji,
    mermaid: candidate.mermaid,
    showFileExtensions:
      candidate.version === 3 ||
      candidate.version === 4 ||
      candidate.version === STORAGE_VERSION
        ? candidate.showFileExtensions === true
        : DEFAULT_MARKDOWN_SETTINGS.showFileExtensions,
    smartTypography: candidate.smartTypography,
    syntaxHighlighting: candidate.syntaxHighlighting,
    theme: isThemeId(candidate.theme)
      ? candidate.theme
      : DEFAULT_MARKDOWN_SETTINGS.theme,
    updateTypeOnExternalMove:
      candidate.version === 4 || candidate.version === STORAGE_VERSION
        ? candidate.updateTypeOnExternalMove === true
        : DEFAULT_MARKDOWN_SETTINGS.updateTypeOnExternalMove,
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
