import { DOCUMENTS_STORE, openAnchoredDb } from "./indexedDb";
import { DOCUMENT_TYPE_NOTE } from "../../types/document";

const NOTES_STORAGE_KEY = "anchored.notes.v0";
const NOTES_BACKUP_KEY = "anchored.notes.v0.backup";
const SCHEMA_VERSION_KEY = "anchored.schema.version";

export function getSchemaVersion() {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SCHEMA_VERSION_KEY);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function setSchemaVersion(version) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCHEMA_VERSION_KEY, String(version));
}

function readLegacyNotes() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to read legacy notes", error);
    return [];
  }
}

function normalizeLegacyNote(note) {
  if (!note || typeof note !== "object") return null;
  if (typeof note.id !== "string") return null;
  const createdAt = Number.isFinite(note.createdAt) ? note.createdAt : Date.now();
  const updatedAt = Number.isFinite(note.updatedAt) ? note.updatedAt : createdAt;
  return {
    id: note.id,
    type: DOCUMENT_TYPE_NOTE,
    title: typeof note.title === "string" || note.title === null ? note.title : null,
    body: typeof note.body === "string" ? note.body : "",
    meta: {},
    createdAt,
    updatedAt,
    deletedAt: null,
  };
}

async function insertDocuments(db, documents) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENTS_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENTS_STORE);

    for (const document of documents) {
      store.add(document);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function migrateLegacyNotes() {
  if (typeof window === "undefined") return;
  const currentVersion = getSchemaVersion();
  if (currentVersion >= 1) return;

  const legacyNotes = readLegacyNotes();
  if (legacyNotes.length === 0) {
    setSchemaVersion(1);
    return;
  }

  const documents = legacyNotes.map(normalizeLegacyNote).filter(Boolean);
  if (documents.length === 0) {
    setSchemaVersion(1);
    return;
  }

  try {
    const db = await openAnchoredDb();
    await insertDocuments(db, documents);

    window.localStorage.setItem(NOTES_BACKUP_KEY, JSON.stringify(legacyNotes));
    window.localStorage.removeItem(NOTES_STORAGE_KEY);
    setSchemaVersion(1);
  } catch (error) {
    console.error("Failed to migrate legacy notes", error);
  }
}
