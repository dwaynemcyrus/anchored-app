# Knowledge v0.5 — Local Search (Title + Body) + Results Navigation
Version: 0.5  
Depends on: Documents Repo v0 + Editor v0 + Focus Mode + Typewriter Scroll  
Purpose: Once writing feels good, the next bottleneck is retrieval. Add fast, local search that scales to thousands of docs.

---

## 0) Explicit Non-Goals
Do NOT build:
- Supabase sync
- Advanced ranking (BM25), semantic search, embeddings
- Tags/folders as part of search
- Saved searches / smart folders
- Highlight-in-editor on open (optional later)

This is: a search box, results list, open result.

---

## 1) UX Scope
Search lives in Notes list route.

### Route
- `/knowledge/notes` (existing list)

### UI
- Add a search input at top of list:
  - placeholder: “Search notes…”
  - clear (×) button
- When query empty:
  - show normal list (updatedAt desc)
- When query non-empty:
  - show results list

### Result item
- Title (derived title rule)
- One snippet line showing match context (best-effort)
- Updated time (optional)

### Interaction
- Tap result → open `/knowledge/notes/[id]`
- Back returns to list with query preserved (use URL querystring)

---

## 2) Query State & Routing
Persist query in URL:
- `/knowledge/notes?q=some+text`

Rules:
- Typing updates local state immediately
- Debounce updating URL by ~250ms (avoid history spam)
- Use replaceState (or Next router replace) while typing
- Hitting Enter can “commit” (optional)

---

## 3) Search Engine v0 (Implementation)
Use naive substring matching first. Optimize just enough.

### Normalization
- Lowercase
- Trim
- Collapse whitespace

### Matching fields
- Title (derived or stored title)
- Body (full markdown text)

### Ranking (simple)
Score results by:
1) Title match beats body match
2) Earlier occurrence beats later occurrence
3) More occurrences beats fewer (optional)

No heavy IR math in v0.

### Snippet generation
- For body match:
  - find first match index
  - return ~80–140 chars around the match
  - replace newlines with spaces
- For title match with no body match:
  - snippet can be first 120 chars of body or empty

---

## 4) Performance Rules (Critical)
The list view must stay fast with many documents.

### Storage strategy
- The repo must provide **lightweight list rows** without loading bodies:
  - `listIndex()` returns: { id, type, title, updatedAt }
- Search needs access to bodies. Two acceptable strategies:

#### Strategy A (v0 recommended): On-demand body scan (debounced)
- When query changes (debounced 200–350ms):
  - fetch candidate docs in batches (e.g., 200 at a time)
  - scan bodies
  - progressively update results
- Pros: no index maintenance yet
- Cons: slower for huge datasets, but acceptable early

#### Strategy B (optional upgrade): Maintain a lightweight searchable cache
- Keep an in-memory map: id → normalized body (or partial)
- Build lazily on first search
- Persist nothing extra

Pick Strategy A for v0 unless performance is unacceptable.

### Hard limits
- Cap results to 50 initially
- If query length < 2 characters:
  - do not search (show normal list)

---

## 5) Edge Cases
- Empty query → normal list
- Very large docs → search still works (may take longer; progressive is OK)
- Deleted docs (deletedAt not null) must not appear
- If note not found on open → show “Not found” + back

---

## 6) Testing Scenarios (Acceptance Criteria)
- Typing a query filters notes correctly
- Title matches appear above body-only matches
- Opening a result routes to editor reliably
- Back returns to list with query intact
- Search does not lock up UI on 1,000+ notes
- Works on iOS without input lag

---

## 7) Suggested Implementation Files
app/
  knowledge/
    notes/
      page.tsx              # add search bar + results
lib/
  search/
    normalize.ts
    searchDocs.ts           # scoring + snippet
store/
  notesUiStore.ts           # optional: query UI state
repo/
  DocumentsRepo.ts
  IndexedDbDocumentsRepo.ts

---

## 8) Definition of Done
- Search feels instant for normal datasets
- No architectural coupling: UI calls `searchDocs(repo, query)`
- URL query param preserves state across navigation/reload
- Results open the correct doc every time

END
