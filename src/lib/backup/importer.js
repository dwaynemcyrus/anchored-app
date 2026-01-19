/**
 * Backup & Restore v0 — Import Functions
 */

import JSZip from "jszip";
import { BACKUP_VERSION } from "./backupTypes";
import { parseTimestamp } from "./parseTimestamp";
import { extractFrontmatter } from "./frontmatter";
import { computePlan, buildConflictNote } from "./diff";

/**
 * Detect the format of an import file.
 * @param {File} file
 * @returns {Promise<"backupJson" | "markdownZip" | "unknown">}
 */
export async function detectImportFormat(file) {
  const name = file.name.toLowerCase();

  // Check extension first
  if (name.endsWith(".zip")) {
    return "markdownZip";
  }

  if (name.endsWith(".json") || name.endsWith(".anchored-backup.json")) {
    return "backupJson";
  }

  // Try to detect by content
  try {
    const slice = await file.slice(0, 100).text();
    if (slice.trim().startsWith("{")) {
      return "backupJson";
    }
    // Check for ZIP magic bytes
    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return "markdownZip";
    }
  } catch {
    // Ignore detection errors
  }

  return "unknown";
}

/**
 * Parse a Backup JSON file.
 * @param {File} file
 * @returns {Promise<{ success: true, data: import('./backupTypes').BackupV1 } | { success: false, error: string }>}
 */
export async function parseBackupJson(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate structure
    if (typeof data !== "object" || data === null) {
      return { success: false, error: "Invalid backup file: not an object" };
    }

    if (typeof data.backupVersion !== "number") {
      return { success: false, error: "Invalid backup file: missing backupVersion" };
    }

    if (data.backupVersion !== BACKUP_VERSION) {
      return {
        success: false,
        error: `Unsupported backup version: ${data.backupVersion}. Expected ${BACKUP_VERSION}.`,
      };
    }

    if (!Array.isArray(data.notes)) {
      return { success: false, error: "Invalid backup file: notes array missing" };
    }

    // Normalize notes
    const notes = data.notes.map(normalizeBackupNote).filter(Boolean);

    return {
      success: true,
      data: {
        ...data,
        notes,
      },
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: "Invalid JSON format" };
    }
    return { success: false, error: err.message || "Failed to parse backup file" };
  }
}

/**
 * Parse a Markdown Bundle (zip) file.
 * @param {File} file
 * @returns {Promise<{ success: true, notes: import('./backupTypes').BackupNoteV1[], manifest: object | null } | { success: false, error: string }>}
 */
export async function parseMarkdownBundle(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    const notes = [];
    let manifest = null;

    // Try to load manifest
    const manifestFile = zip.file("manifest.json");
    if (manifestFile) {
      try {
        const manifestText = await manifestFile.async("string");
        manifest = JSON.parse(manifestText);
      } catch {
        // Manifest is optional, continue without it
      }
    }

    // Find and parse all .md files
    const mdFiles = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && relativePath.toLowerCase().endsWith(".md")) {
        mdFiles.push({ path: relativePath, entry: zipEntry });
      }
    });

    for (const { path, entry } of mdFiles) {
      try {
        const content = await entry.async("string");
        const note = parseMarkdownNote(content, path);
        if (note) {
          notes.push(note);
        }
      } catch {
        // Skip malformed files
        console.warn(`Skipping malformed markdown file: ${path}`);
      }
    }

    return { success: true, notes, manifest };
  } catch (err) {
    return { success: false, error: err.message || "Failed to parse zip file" };
  }
}

/**
 * Parse a single markdown note from content.
 * @param {string} content
 * @param {string} path - File path for fallback title
 * @returns {import('./backupTypes').BackupNoteV1 | null}
 */
function parseMarkdownNote(content, path) {
  const { meta, body } = extractFrontmatter(content);

  // Extract or generate ID
  const id = meta.id || null;

  // Extract title (from frontmatter, first line, or filename)
  let title = meta.title || "";
  if (!title) {
    const firstLine = body.split(/\r?\n/).find((l) => l.trim());
    if (firstLine) {
      // Strip markdown heading prefix
      title = firstLine.replace(/^#+\s*/, "").trim();
    }
  }
  if (!title) {
    // Use filename without extension and suffix
    const filename = path.split("/").pop() || "untitled";
    title = filename.replace(/__[a-z0-9]+\.md$/i, "").replace(/\.md$/i, "").replace(/-/g, " ");
  }

  const now = new Date().toISOString();

  return {
    id,
    title,
    body,
    createdAt: meta.createdAt || now,
    updatedAt: meta.updatedAt || now,
    deletedAt: meta.deletedAt || null,
    archivedAt: meta.archivedAt || null,
  };
}

/**
 * Normalize a backup note, ensuring all fields exist.
 * @param {any} note
 * @returns {import('./backupTypes').BackupNoteV1 | null}
 */
function normalizeBackupNote(note) {
  if (!note || typeof note !== "object") {
    return null;
  }

  if (typeof note.id !== "string" || !note.id) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: note.id,
    title: typeof note.title === "string" ? note.title : "Untitled",
    body: typeof note.body === "string" ? note.body : "",
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now,
    deletedAt: note.deletedAt || null,
    archivedAt: note.archivedAt || null,
  };
}

/**
 * Convert a backup note to repo document format.
 * @param {import('./backupTypes').BackupNoteV1} note
 * @param {string} [newId] - Optional new ID to use instead of note.id
 * @returns {Object}
 */
export function backupNoteToDocument(note, newId) {
  return {
    id: newId || note.id,
    type: "note",
    title: note.title || null,
    body: note.body || "",
    meta: {},
    createdAt: parseTimestamp(note.createdAt) || Date.now(),
    updatedAt: parseTimestamp(note.updatedAt) || Date.now(),
    deletedAt: parseTimestamp(note.deletedAt),
    archivedAt: parseTimestamp(note.archivedAt),
  };
}

/**
 * Generate a unique ID for new notes.
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Perform a dry-run import analysis without modifying the repo.
 *
 * @param {File} file
 * @param {Object} repo - Documents repository
 * @returns {Promise<import('./backupTypes').DryRunResult>}
 */
export async function dryRunImport(file, repo) {
  // Detect format
  const format = await detectImportFormat(file);
  if (format === "unknown") {
    return {
      success: false,
      format: "unknown",
      backupVersion: 0,
      totalIncoming: 0,
      plan: { items: [], addCount: 0, updateCount: 0, skipCount: 0, conflictCount: 0 },
      error: "Unknown file format. Expected .json or .zip file.",
    };
  }

  // Parse file
  let incomingNotes = [];
  let backupVersion = BACKUP_VERSION;

  if (format === "backupJson") {
    const result = await parseBackupJson(file);
    if (!result.success) {
      return {
        success: false,
        format,
        backupVersion: 0,
        totalIncoming: 0,
        plan: { items: [], addCount: 0, updateCount: 0, skipCount: 0, conflictCount: 0 },
        error: result.error,
      };
    }
    incomingNotes = result.data.notes;
    backupVersion = result.data.backupVersion;
  } else {
    const result = await parseMarkdownBundle(file);
    if (!result.success) {
      return {
        success: false,
        format,
        backupVersion: BACKUP_VERSION,
        totalIncoming: 0,
        plan: { items: [], addCount: 0, updateCount: 0, skipCount: 0, conflictCount: 0 },
        error: result.error,
      };
    }
    incomingNotes = result.notes;
  }

  // Get existing notes for comparison
  const existingDocs = await repo.listAllForBackup();

  // Compute plan
  const plan = computePlan(incomingNotes, existingDocs);

  return {
    success: true,
    format,
    backupVersion,
    totalIncoming: incomingNotes.length,
    plan,
  };
}

/**
 * Apply an import to the repo.
 *
 * @param {File} file
 * @param {Object} repo - Documents repository
 * @param {"merge" | "replaceAll"} mode
 * @returns {Promise<import('./backupTypes').ImportResult>}
 */
export async function applyImport(file, repo, mode) {
  // Detect format
  const format = await detectImportFormat(file);
  if (format === "unknown") {
    return {
      success: false,
      added: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      conflictIds: [],
      error: "Unknown file format",
    };
  }

  // Parse file
  let incomingNotes = [];

  if (format === "backupJson") {
    const result = await parseBackupJson(file);
    if (!result.success) {
      return {
        success: false,
        added: 0,
        updated: 0,
        skipped: 0,
        conflicts: 0,
        conflictIds: [],
        error: result.error,
      };
    }
    incomingNotes = result.data.notes;
  } else {
    // Replace All not allowed for markdown bundles
    if (mode === "replaceAll") {
      return {
        success: false,
        added: 0,
        updated: 0,
        skipped: 0,
        conflicts: 0,
        conflictIds: [],
        error: "Replace All is only available for Backup JSON files",
      };
    }
    const result = await parseMarkdownBundle(file);
    if (!result.success) {
      return {
        success: false,
        added: 0,
        updated: 0,
        skipped: 0,
        conflicts: 0,
        conflictIds: [],
        error: result.error,
      };
    }
    incomingNotes = result.notes;
  }

  // Handle Replace All mode
  if (mode === "replaceAll") {
    try {
      await repo.deleteAllNotes();
      const documents = incomingNotes.map((note) => backupNoteToDocument(note));
      await repo.bulkUpsert(documents);
      return {
        success: true,
        added: incomingNotes.length,
        updated: 0,
        skipped: 0,
        conflicts: 0,
        conflictIds: [],
      };
    } catch (err) {
      return {
        success: false,
        added: 0,
        updated: 0,
        skipped: 0,
        conflicts: 0,
        conflictIds: [],
        error: err.message || "Failed to replace notes",
      };
    }
  }

  // Handle Merge mode
  try {
    const existingDocs = await repo.listAllForBackup();
    const plan = computePlan(incomingNotes, existingDocs);

    const documentsToUpsert = [];
    const conflictIds = [];

    for (const item of plan.items) {
      switch (item.action) {
        case "add": {
          // Generate new ID if note has no ID
          const newId = item.incoming.id || generateId();
          documentsToUpsert.push(backupNoteToDocument(item.incoming, newId));
          break;
        }
        case "update": {
          documentsToUpsert.push(backupNoteToDocument(item.incoming));
          break;
        }
        case "conflict": {
          const { note, newId } = buildConflictNote(item.incoming, item.existingId);
          documentsToUpsert.push(backupNoteToDocument(note, newId));
          conflictIds.push(newId);
          break;
        }
        case "skip":
        default:
          // Do nothing
          break;
      }
    }

    if (documentsToUpsert.length > 0) {
      await repo.bulkUpsert(documentsToUpsert);
    }

    return {
      success: true,
      added: plan.addCount,
      updated: plan.updateCount,
      skipped: plan.skipCount,
      conflicts: plan.conflictCount,
      conflictIds,
    };
  } catch (err) {
    return {
      success: false,
      added: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      conflictIds: [],
      error: err.message || "Failed to import notes",
    };
  }
}
