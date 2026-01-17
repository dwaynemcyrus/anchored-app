import { IndexedDbDocumentsRepo } from "./IndexedDbDocumentsRepo";
import { migrateLegacyNotes } from "../db/migrations";

let repoInstance = null;

export function getDocumentsRepo() {
  if (!repoInstance) {
    repoInstance = new IndexedDbDocumentsRepo();
    if (typeof window !== "undefined") {
      migrateLegacyNotes();
    }
  }
  return repoInstance;
}
