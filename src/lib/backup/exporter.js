/**
 * Backup & Restore v0 — Export Functions
 */

import JSZip from "jszip";
import { BACKUP_VERSION, BUNDLE_VERSION } from "./backupTypes";
import { toISOString } from "./parseTimestamp";
import { serializeFrontmatter } from "./frontmatter";
import { noteFilename } from "./safeFilename";
import { deriveDocumentTitle } from "../documents/deriveTitle";

/**
 * Get app version from package.json (embedded at build time or fallback).
 */
function getAppVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";
}

/**
 * Format timestamp for filename: YYYYMMDD-HHMMSS in local time.
 * @param {Date} date
 * @returns {string}
 */
function formatTimestampForFilename(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Convert a repo document to backup note format.
 * @param {Object} doc - Repo document
 * @returns {import('./backupTypes').BackupNoteV1}
 */
function docToBackupNote(doc) {
  return {
    id: doc.id,
    title: deriveDocumentTitle(doc),
    body: doc.body || "",
    createdAt: toISOString(doc.createdAt) || new Date().toISOString(),
    updatedAt: toISOString(doc.updatedAt) || new Date().toISOString(),
    deletedAt: toISOString(doc.deletedAt),
    archivedAt: toISOString(doc.archivedAt),
  };
}

/**
 * Export all notes to Backup JSON format.
 * @param {Object} repo - Documents repository
 * @returns {Promise<import('./backupTypes').BackupV1>}
 */
export async function exportBackupJson(repo) {
  const documents = await repo.listAllForBackup();
  const notes = documents.map(docToBackupNote);

  const totalChars = notes.reduce((sum, note) => sum + note.body.length, 0);

  /** @type {import('./backupTypes').BackupV1} */
  const backup = {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    source: {
      platform: "web",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    },
    stats: {
      notesCount: notes.length,
      totalChars,
    },
    notes,
  };

  return backup;
}

/**
 * Export all notes to Markdown Bundle (zip).
 * @param {Object} repo - Documents repository
 * @returns {Promise<Blob>}
 */
export async function exportMarkdownBundle(repo) {
  const documents = await repo.listAllForBackup();
  const notes = documents.map(docToBackupNote);

  const zip = new JSZip();
  const notesFolder = zip.folder("notes");
  const manifestEntries = [];

  for (const note of notes) {
    const filename = noteFilename(note.title, note.id);
    const path = `notes/${filename}`;

    // Build frontmatter
    const frontmatter = serializeFrontmatter({
      id: note.id,
      title: note.title,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      archivedAt: note.archivedAt,
    });

    const content = frontmatter + note.body;
    notesFolder.file(filename, content);

    manifestEntries.push({ path, id: note.id });
  }

  // Add manifest
  const manifest = {
    bundleVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    notes: manifestEntries,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: "blob" });
}

/**
 * Generate filename for backup JSON export.
 * @returns {string}
 */
export function getBackupJsonFilename() {
  const timestamp = formatTimestampForFilename(new Date());
  return `anchored-backup-${timestamp}.json`;
}

/**
 * Generate filename for markdown bundle export.
 * @returns {string}
 */
export function getMarkdownBundleFilename() {
  const timestamp = formatTimestampForFilename(new Date());
  return `anchored-md-${timestamp}.zip`;
}

/**
 * Trigger a file download in the browser.
 * Uses File System Access API when available, falls back to blob URL.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @param {Object} [options]
 * @param {string} [options.mimeType]
 * @returns {Promise<void>}
 */
export async function downloadBlob(blob, filename, options = {}) {
  // Try File System Access API first (modern browsers)
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: filename.endsWith(".zip") ? "ZIP Archive" : "JSON File",
            accept: filename.endsWith(".zip")
              ? { "application/zip": [".zip"] }
              : { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled or API not supported, fall through to legacy
      if (err.name === "AbortError") {
        return; // User cancelled
      }
    }
  }

  // Fallback: create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
