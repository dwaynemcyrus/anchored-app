// @deprecated Use searchDocuments.js instead
// This file is kept for backward compatibility during transition
export {
  searchDocuments as searchNotes,
  searchDocuments,
  buildSearchIndex,
  ensureSearchIndex,
  updateSearchIndex,
  removeFromSearchIndex,
  clearSearchIndex,
} from "./searchDocuments";
