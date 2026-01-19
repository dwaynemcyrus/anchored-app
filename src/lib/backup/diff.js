/**
 * Backup & Restore v0 — Diff Engine & Conflict Logic
 */

import { parseTimestamp } from "./parseTimestamp";

/**
 * Classify what action to take for an incoming note.
 *
 * @param {import('./backupTypes').BackupNoteV1} incoming
 * @param {Object | null} existing - Existing repo document or null
 * @returns {"add" | "update" | "skip" | "conflict"}
 */
export function classify(incoming, existing) {
  // No existing note with this ID - add as new
  if (!existing) {
    return "add";
  }

  const incomingUpdated = parseTimestamp(incoming.updatedAt);
  const existingUpdated = parseTimestamp(existing.updatedAt);

  // If timestamps are missing/unparseable, treat as conflict
  if (incomingUpdated === null || existingUpdated === null) {
    return "conflict";
  }

  // Incoming is newer - update
  if (incomingUpdated > existingUpdated) {
    return "update";
  }

  // Existing is newer - skip (keep local)
  if (existingUpdated > incomingUpdated) {
    return "skip";
  }

  // Same timestamp - check if bodies differ
  if (incomingUpdated === existingUpdated) {
    const incomingBody = incoming.body || "";
    const existingBody = existing.body || "";
    if (incomingBody !== existingBody) {
      return "conflict";
    }
    // Same timestamp and same body - skip
    return "skip";
  }

  return "skip";
}

/**
 * Compute an import plan by comparing incoming notes against existing notes.
 *
 * @param {import('./backupTypes').BackupNoteV1[]} incomingNotes
 * @param {Object[]} existingDocs - Existing repo documents
 * @returns {import('./backupTypes').ImportPlan}
 */
export function computePlan(incomingNotes, existingDocs) {
  // Build lookup map for existing docs by ID
  const existingById = new Map();
  for (const doc of existingDocs) {
    existingById.set(doc.id, doc);
  }

  /** @type {import('./backupTypes').ImportPlanItem[]} */
  const items = [];
  let addCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  let conflictCount = 0;

  for (const incoming of incomingNotes) {
    // Notes without ID are always added as new
    if (!incoming.id) {
      items.push({
        action: "add",
        incoming,
        existingId: null,
      });
      addCount++;
      continue;
    }

    const existing = existingById.get(incoming.id);
    const action = classify(incoming, existing);

    items.push({
      action,
      incoming,
      existingId: existing ? existing.id : null,
    });

    switch (action) {
      case "add":
        addCount++;
        break;
      case "update":
        updateCount++;
        break;
      case "skip":
        skipCount++;
        break;
      case "conflict":
        conflictCount++;
        break;
    }
  }

  return {
    items,
    addCount,
    updateCount,
    skipCount,
    conflictCount,
  };
}

/**
 * Generate a unique ID for a conflict note.
 * @returns {string}
 */
function generateConflictId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `conflict_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Build a conflict note from an incoming note.
 * The conflict note is a new note with:
 * - New ID
 * - Title prefixed with "CONFLICT — "
 * - Body with conflict header
 *
 * @param {import('./backupTypes').BackupNoteV1} incoming
 * @param {string} existingId - ID of the existing note it conflicted with
 * @returns {{ note: import('./backupTypes').BackupNoteV1, newId: string }}
 */
export function buildConflictNote(incoming, existingId) {
  const newId = generateConflictId();
  const now = new Date().toISOString();

  const conflictHeader = [
    "> **Import Conflict**",
    `> This note conflicted with an existing note (ID: ${existingId}).`,
    "> The original note was preserved. Review and merge manually.",
    `> Imported: ${now}`,
    "",
    "---",
    "",
  ].join("\n");

  const note = {
    id: newId,
    title: `CONFLICT — ${incoming.title || "Untitled"}`,
    body: conflictHeader + (incoming.body || ""),
    createdAt: incoming.createdAt || now,
    updatedAt: now,
    deletedAt: null,
    archivedAt: null,
  };

  return { note, newId };
}
