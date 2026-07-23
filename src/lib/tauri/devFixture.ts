import type {
  CreateInboxVaultFileRequest,
  CreateVaultFileRequest,
  LifecycleVaultFileRequest,
  RenameVaultFileRequest,
  SaveVaultFileRequest,
  TimestampMigrationTarget,
  VaultDocument,
  VaultFile,
  VaultSnapshot,
} from "./vault";

const FIXTURE_VAULT_ID = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
const FIXTURE_VAULT_NAME = "Anchored Development Fixture";
const fixtureSources = import.meta.glob("../../../fixtures/dev-vault/**/*", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

let fixtureFiles = new Map<string, string>();
let fixtureRevision = 0;
let initialized = false;

function fixtureRelativePath(sourcePath: string): string {
  const marker = "/fixtures/dev-vault/";
  const markerIndex = sourcePath.indexOf(marker);
  return sourcePath.slice(markerIndex + marker.length);
}

function resetFixture(): void {
  fixtureFiles = new Map(
    Object.entries(fixtureSources).map(([sourcePath, content]) => [
      fixtureRelativePath(sourcePath),
      content,
    ]),
  );
  fixtureRevision += 1;
  initialized = true;
}

function ensureFixture(): void {
  if (!initialized) resetFixture();
}

function frontMatter(content: string): Record<string, string> {
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s|^\s*#/.test(line)) continue;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/\s+#.*$/, "");
    values[key] = value.replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function frontMatterList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function outgoingLinks(content: string): string[] {
  const links = new Set<string>();
  const pattern = /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of content.matchAll(pattern)) links.add(match[1].trim());
  return [...links];
}

function parentPath(relativePath: string): string {
  const separator = relativePath.lastIndexOf("/");
  return separator < 0 ? "" : relativePath.slice(0, separator);
}

function fileName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1);
}

function modifiedMillis(relativePath: string): number {
  let hash = 0;
  for (const character of relativePath)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return Date.UTC(2026, 6, 23) + (hash % 86_400_000) + fixtureRevision;
}

function vaultFile(relativePath: string, content: string): VaultFile {
  const metadata = frontMatter(content);
  return {
    aliases: frontMatterList(metadata.aliases),
    archivedAt: metadata.archived_at,
    createdAt: metadata.created_at,
    isRecoveryCopy: false,
    modifiedMillis: modifiedMillis(relativePath),
    name: fileName(relativePath),
    noteType: metadata.type,
    outgoingLinks: outgoingLinks(content),
    parent: parentPath(relativePath),
    relativePath,
    status: metadata.status,
    updatedAt: metadata.updated_at,
  };
}

function snapshot(): VaultSnapshot {
  ensureFixture();
  const files: VaultFile[] = [];
  const assets: VaultSnapshot["assets"] = [];
  const folders = new Set<string>();

  for (const [relativePath, content] of [...fixtureFiles.entries()].sort()) {
    const parent = parentPath(relativePath);
    if (parent) {
      const parts = parent.split("/");
      parts.forEach((_, index) =>
        folders.add(parts.slice(0, index + 1).join("/")),
      );
    }
    if (relativePath.toLowerCase().endsWith(".md")) {
      files.push(vaultFile(relativePath, content));
    } else {
      assets.push({
        modifiedMillis: modifiedMillis(relativePath),
        name: fileName(relativePath),
        parent,
        relativePath,
      });
    }
  }

  return {
    assets,
    files,
    folders: [...folders].sort(),
    name: FIXTURE_VAULT_NAME,
    vaultId: FIXTURE_VAULT_ID,
    warnings: { skippedNonUtf8Paths: 0, skippedSymlinks: 0 },
  };
}

function document(
  relativePath: string,
  content = fixtureFiles.get(relativePath),
): VaultDocument {
  if (content === undefined)
    throw new Error(`Fixture file not found: ${relativePath}`);
  const metadata = frontMatter(content);
  return {
    archivedAt: metadata.archived_at,
    content,
    createdAt: metadata.created_at,
    modifiedMillis: modifiedMillis(relativePath),
    noteType: metadata.type,
    relativePath,
    sizeBytes: new TextEncoder().encode(content).length,
    status: metadata.status,
    updatedAt: metadata.updated_at,
  };
}

function requireArgument<T>(
  args: Record<string, unknown> | undefined,
  key: string,
): T {
  const value = args?.[key];
  if (value === undefined) throw new Error(`Missing fixture argument: ${key}`);
  return value as T;
}

function replaceProperty(
  content: string,
  updates: Record<string, string | undefined>,
): string {
  const lines = content.split(/(?<=\n)/);
  const seen = new Set<string>();
  let inFrontMatter = false;
  let closingIndex = -1;
  const updated = lines.map((line, index) => {
    const withoutEnding = line.replace(/\r?\n$/, "");
    if (index === 0 && withoutEnding.replace(/^\uFEFF/, "") === "---") {
      inFrontMatter = true;
      return line;
    }
    if (inFrontMatter && withoutEnding === "---") {
      closingIndex = index;
      inFrontMatter = false;
      return line;
    }
    if (!inFrontMatter || /^\s/.test(withoutEnding)) return line;
    const separator = withoutEnding.indexOf(":");
    if (separator < 1) return line;
    const key = withoutEnding.slice(0, separator).trim();
    if (!(key in updates)) return line;
    seen.add(key);
    const value = updates[key];
    return value === undefined
      ? ""
      : `${key}: ${value}${line.endsWith("\n") ? "\n" : ""}`;
  });

  if (closingIndex >= 0) {
    const additions = Object.entries(updates)
      .filter(([key, value]) => value !== undefined && !seen.has(key))
      .map(([key, value]) => `${key}: ${value}\n`);
    updated.splice(closingIndex, 0, ...additions);
  }
  return updated.join("");
}

function timestampWithLocalOffset(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const offsetMinutes = -parsed.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  const iso = parsed.toISOString().slice(0, 19);
  return `${iso}${offset}`;
}

function normalizeContent(content: string): {
  after: string;
  changes: Array<{
    after: string;
    before: string;
    line: number;
    property: string;
  }>;
  issues: Array<{
    line: number;
    message: string;
    property: string;
    value: string;
  }>;
} {
  const changes: Array<{
    after: string;
    before: string;
    line: number;
    property: string;
  }> = [];
  const issues: Array<{
    line: number;
    message: string;
    property: string;
    value: string;
  }> = [];
  const lines = content.split(/\r?\n/);
  const replacements: Array<{ line: number; value: string }> = [];
  let inFrontMatter = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (index === 0 && trimmed === "---") {
      inFrontMatter = true;
      return;
    }
    if (inFrontMatter && trimmed === "---") {
      inFrontMatter = false;
      return;
    }
    if (!inFrontMatter || /^\s|^#/.test(line)) return;
    const separator = line.indexOf(":");
    if (separator < 1) return;
    const property = line.slice(0, separator).trim();
    const raw = line
      .slice(separator + 1)
      .trim()
      .replace(/\s+#.*$/, "");
    const unquoted = raw.replace(/^['"]|['"]$/g, "");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(unquoted)) return;
    if (/\.\d+/.test(unquoted)) {
      issues.push({
        line: index + 1,
        message: "Timestamp is not canonical RFC 3339 with second precision.",
        property,
        value: unquoted,
      });
      return;
    }
    const normalized = timestampWithLocalOffset(unquoted);
    if (!normalized) {
      issues.push({
        line: index + 1,
        message: "Timestamp is not valid RFC 3339.",
        property,
        value: unquoted,
      });
      return;
    }
    if (normalized !== unquoted) {
      changes.push({
        after: normalized,
        before: unquoted,
        line: index + 1,
        property,
      });
      replacements.push({ line: index, value: normalized });
    }
  });

  for (const replacement of replacements) {
    const line = lines[replacement.line];
    const separator = line.indexOf(":");
    const prefix = line.slice(0, separator + 1);
    const suffix = line.match(/\s+#.*$/)?.[0] ?? "";
    const quote = line
      .slice(separator + 1)
      .trim()
      .startsWith("'")
      ? "'"
      : line
            .slice(separator + 1)
            .trim()
            .startsWith('"')
        ? '"'
        : "";
    lines[replacement.line] =
      `${prefix} ${quote}${replacement.value}${quote}${suffix}`;
  }
  return { after: lines.join("\n"), changes, issues };
}

function previewTimestampMigration() {
  ensureFixture();
  const candidates = [];
  const issues = [];
  for (const [relativePath, content] of fixtureFiles) {
    if (!relativePath.endsWith(".md")) continue;
    const normalized = normalizeContent(content);
    issues.push(
      ...normalized.issues.map((issue) => ({ relativePath, ...issue })),
    );
    if (normalized.changes.length > 0) {
      candidates.push({
        changes: normalized.changes,
        expectedModifiedMillis: modifiedMillis(relativePath),
        expectedSizeBytes: new TextEncoder().encode(content).length,
        relativePath,
      });
    }
  }
  return {
    candidates,
    changedValues: candidates.reduce(
      (total, item) => total + item.changes.length,
      0,
    ),
    issues,
    scannedFiles: [...fixtureFiles.keys()].filter((path) =>
      path.endsWith(".md"),
    ).length,
  };
}

function migrateTimestampFiles(targets: TimestampMigrationTarget[]) {
  const outcomes = targets.map((target) => {
    const content = fixtureFiles.get(target.relativePath);
    if (content === undefined)
      return {
        changedValues: 0,
        message: "File no longer exists.",
        relativePath: target.relativePath,
        status: "error" as const,
      };
    const currentSize = new TextEncoder().encode(content).length;
    if (
      currentSize !== target.expectedSizeBytes ||
      modifiedMillis(target.relativePath) !== target.expectedModifiedMillis
    ) {
      return {
        changedValues: 0,
        relativePath: target.relativePath,
        status: "conflict" as const,
      };
    }
    const normalized = normalizeContent(content);
    fixtureFiles.set(target.relativePath, normalized.after);
    return {
      changedValues: normalized.changes.length,
      relativePath: target.relativePath,
      status: "applied" as const,
    };
  });
  fixtureRevision += 1;
  return { outcomes, snapshot: snapshot() };
}

function createFile(relativePath: string, content: string): VaultDocument {
  ensureFixture();
  let nextPath = relativePath;
  let suffix = 2;
  while (fixtureFiles.has(nextPath)) {
    const extension = nextPath.endsWith(".md") ? ".md" : "";
    const base = nextPath.slice(0, nextPath.length - extension.length);
    nextPath = `${base} ${suffix}${extension}`;
    suffix += 1;
  }
  fixtureFiles.set(nextPath, content);
  fixtureRevision += 1;
  return document(nextPath);
}

function updateLifecycle(
  request: LifecycleVaultFileRequest,
  updates: Record<string, string | undefined>,
): VaultDocument {
  const content = fixtureFiles.get(request.relativePath);
  if (content === undefined) throw new Error("Fixture note no longer exists.");
  if (content !== request.expectedContent)
    throw new Error("Fixture note changed externally.");
  const updated = replaceProperty(content, updates);
  fixtureFiles.set(request.relativePath, updated);
  fixtureRevision += 1;
  return document(request.relativePath, updated);
}

export async function invokeDevelopmentFixture<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  ensureFixture();
  switch (command) {
    case "open_development_vault":
      resetFixture();
      return snapshot() as T;
    case "select_vault":
    case "open_remembered_vault":
    case "rescan_vault":
      ensureFixture();
      return snapshot() as T;
    case "list_remembered_vaults":
    case "forget_vault":
      return [] as T;
    case "list_vault_trash":
      return [] as T;
    case "stop_vault_file_watch":
    case "stop_vault_tree_watch":
    case "watch_vault_file":
    case "watch_vault_tree":
      return undefined as T;
    case "read_vault_file":
      return document(requireArgument<string>(args, "relativePath")) as T;
    case "search_vault": {
      const query = requireArgument<string>(args, "query").toLowerCase();
      const matches = [];
      for (const [relativePath, content] of fixtureFiles) {
        if (!relativePath.endsWith(".md")) continue;
        const line = content
          .split(/\r?\n/)
          .findIndex((value) => value.toLowerCase().includes(query));
        if (line >= 0)
          matches.push({
            line: line + 1,
            relativePath,
            snippet: content.split(/\r?\n/)[line].trim(),
          });
      }
      return {
        matches: matches.slice(0, 100),
        searchedFiles: fixtureFiles.size,
        skippedFiles: 0,
        truncated: matches.length > 100,
      } as T;
    }
    case "save_vault_file": {
      const request = args as unknown as SaveVaultFileRequest;
      const current = fixtureFiles.get(request.relativePath);
      if (current !== request.expectedContent)
        throw new Error("Fixture note changed externally.");
      fixtureFiles.set(request.relativePath, request.content);
      fixtureRevision += 1;
      return document(request.relativePath, request.content) as T;
    }
    case "create_vault_file": {
      const request = args as unknown as CreateVaultFileRequest;
      return createFile(request.suggestedName, request.content) as T;
    }
    case "create_inbox_vault_file": {
      const request = args as unknown as CreateInboxVaultFileRequest;
      return createFile(
        `inbox/${request.name.replace(/\.md$/i, "")}.md`,
        request.content,
      ) as T;
    }
    case "create_untitled_vault_file":
      return createFile(
        `inbox/Untitled.md`,
        requireArgument<string>(args, "content"),
      ) as T;
    case "create_vault_conflict_copy": {
      const relativePath = requireArgument<string>(args, "relativePath");
      const content = requireArgument<string>(args, "content");
      return createFile(
        `inbox/${fileName(relativePath).replace(/\.md$/i, "")} Anchored conflict.md`,
        content,
      ) as T;
    }
    case "archive_vault_file":
      return updateLifecycle(args as unknown as LifecycleVaultFileRequest, {
        status: "archived",
        archived_at: new Date().toISOString(),
      }) as T;
    case "restore_archived_vault_file": {
      const request = args as unknown as LifecycleVaultFileRequest & {
        destinationStatus: string;
      };
      return updateLifecycle(request, {
        status: request.destinationStatus,
        archived_at: undefined,
      }) as T;
    }
    case "move_vault_file_to_workbench":
      return updateLifecycle(args as unknown as LifecycleVaultFileRequest, {
        status: "active",
      }) as T;
    case "preview_vault_timestamp_migration":
      return previewTimestampMigration() as T;
    case "apply_vault_timestamp_migration":
      return migrateTimestampFiles(
        requireArgument<TimestampMigrationTarget[]>(args, "candidates"),
      ) as T;
    case "create_vault_folder":
    case "rename_vault_folder":
    case "move_vault_folder":
    case "delete_vault_folder":
      return snapshot() as T;
    case "rename_vault_file": {
      const request = args as unknown as RenameVaultFileRequest;
      const content = fixtureFiles.get(request.relativePath);
      if (content === undefined)
        throw new Error("Fixture note no longer exists.");
      const nextPath = `${parentPath(request.relativePath)}${parentPath(request.relativePath) ? "/" : ""}${request.name}`;
      fixtureFiles.delete(request.relativePath);
      fixtureFiles.set(nextPath, content);
      fixtureRevision += 1;
      return { relativePath: nextPath, updatedFiles: 1, updatedLinks: 0 } as T;
    }
    case "move_vault_file_to_folder": {
      const relativePath = requireArgument<string>(args, "relativePath");
      const destinationFolder = requireArgument<string>(
        args,
        "destinationFolder",
      );
      const content = fixtureFiles.get(relativePath);
      if (content === undefined)
        throw new Error("Fixture note no longer exists.");
      const nextPath = `${destinationFolder}/${fileName(relativePath)}`;
      fixtureFiles.delete(relativePath);
      fixtureFiles.set(nextPath, content);
      fixtureRevision += 1;
      return { relativePath: nextPath, updatedFiles: 1, updatedLinks: 0 } as T;
    }
    default:
      throw new Error(
        `Development fixture command not implemented: ${command}`,
      );
  }
}
