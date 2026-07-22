export type FileType =
  | "archive"
  | "audio"
  | "code"
  | "image"
  | "markdown"
  | "pdf"
  | "text"
  | "video"
  | "unknown";

const extensionsByType: Record<Exclude<FileType, "unknown">, Set<string>> = {
  archive: new Set(["7z", "bz2", "gz", "rar", "tar", "xz", "zip"]),
  audio: new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]),
  code: new Set([
    "c",
    "cpp",
    "css",
    "go",
    "html",
    "java",
    "js",
    "json",
    "py",
    "rb",
    "rs",
    "sh",
    "sql",
    "ts",
    "tsx",
    "xml",
    "yaml",
    "yml",
  ]),
  image: new Set(["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]),
  markdown: new Set(["md", "markdown", "mdown", "mkdn", "mdwn"]),
  pdf: new Set(["pdf"]),
  text: new Set(["csv", "log", "rtf", "text", "txt"]),
  video: new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"]),
};

export function fileExtension(fileName: string): string {
  const lastSegment = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = lastSegment.lastIndexOf(".");
  return dot > 0 ? lastSegment.slice(dot + 1).toLocaleLowerCase() : "";
}

export function displayFileName(
  fileName: string,
  showFileExtensions: boolean,
): string {
  if (showFileExtensions) return fileName;
  const lastSegment = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return fileName;
  return fileName.slice(0, fileName.length - (lastSegment.length - dot));
}

export function displayFilePath(
  filePath: string,
  showFileExtensions: boolean,
): string {
  if (showFileExtensions) return filePath;
  const separator = filePath.lastIndexOf("/");
  const folder = separator >= 0 ? filePath.slice(0, separator + 1) : "";
  const name = filePath.slice(separator + 1);
  return `${folder}${displayFileName(name, false)}`;
}

export function fileTypeForName(fileName: string): FileType {
  const extension = fileExtension(fileName);
  if (!extension) return "unknown";

  for (const [type, extensions] of Object.entries(extensionsByType)) {
    if (extensions.has(extension)) return type as Exclude<FileType, "unknown">;
  }

  return "unknown";
}

export function fileTypeLabel(type: FileType): string {
  return type === "markdown"
    ? "Markdown"
    : type.charAt(0).toLocaleUpperCase() + type.slice(1);
}
