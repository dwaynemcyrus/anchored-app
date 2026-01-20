# Anchored OS — Search v1.5 Build Spec (Offline, Trust + Speed)
To continue this session, run codex resume 019bdba6-46e6-7ef3-8b23-c7b1361a5ad2

## Scope
Implement Search v1.5 for Anchored OS.
- Local-first, markdown-first, notes-only.
- Works fully offline.
- Searches title, slug, and body.
- Typo-tolerant and forgiving.
- Ranking must feel human: exact > recent > partial.
- Keyboard-first and mobile-safe.
- No filters UI.
- No new concepts introduced.

Assume existing systems:
- Now View v1
- Wiki-links v1 autocomplete
- Quick Capture / Command modal patterns
- Notes store + routing by slug

Non-goals:
- Sync, Supabase, tasks, filters UI, advanced query language, tags, faceting.

---

## Definition: “Trustworthy search”
Search is trustworthy if it is:
1) Predictable: same query => same ordering unless notes changed.
2) Honest: exact matches always win over fuzzy.
3) Fast: keystroke-to-results feels instant; UI never blocks.
4) Forgiving: typos handled as fallback; never outranks exact.
5) Stable: results don’t thrash between keystrokes; deterministic tiebreak.
6) Intent-respecting: slug/title exact behaves like “take me there”.

---

## Data + Indexing

### Note fields
Each note has:
- slug (unique key)
- title (derived / stored)
- body (markdown string)
- updatedAt (preferred)
- createdAt (fallback)

### Normalization
Create a normalization function used for query + index:
- lowercase
- trim
- collapse whitespace
- strip punctuation boundaries for matching (keep original for display)
- tokenize on whitespace + punctuation boundaries

### Index strategy (offline, fast)
Implement an in-memory index built from the local notes store:
- For each note:
  - store normalized title, slug, body
  - store tokens for title, slug, body (arrays or sets)
- Build index:
  - on app boot (lazy if needed)
  - update incrementally on note create/update/delete
- Performance:
  - debounce query evaluation (e.g., 40–80ms)
  - never block the main thread; keep UI responsive

---

## Search API

### Function signature
searchNotes(query: string, limit: number) => Array<SearchResult>

SearchResult:
- slug
- title
- snippet (string)
- matchMeta:
  - tier
  - field (title|slug|body)
  - matchedRanges (optional)

### Empty query behavior
If normalized query == "":
- return recent notes ordered by updatedAt desc
- limit to 12 (or existing “recent” cap)

---

## Ranking Rules

### Match tiers (highest priority first)

Tier 0 — Direct identity  
1. slug exact match (query == slug)  
2. title exact match (query == title)

Tier 1 — Strong intent  
3. slug prefix match (slug startsWith query)  
4. title prefix match (title startsWith query)

Tier 2 — Solid relevance  
5. exact token match in title  
6. exact token match in slug  
7. exact phrase match in title (substring)  
8. exact phrase match in body (substring)

Tier 3 — Partial  
9. token partial match in title  
10. token partial match in slug  
11. token partial match in body

Tier 4 — Fuzzy fallback  
12. fuzzy match title  
13. fuzzy match slug  
14. fuzzy match body (limited, conservative)

### Fuzzy activation rules
Enable fuzzy only when:
- query length >= 3 AND
- no Tier 0–2 results OR Tier 0–2 results < 3

Fuzzy constraints:
- prefer title/slug fuzzy over body
- edit distance:
  - length 3–5: <= 1
  - length 6–10: <= 2
  - >10: <= 2
- fuzzy results always remain Tier 4

### Scoring inside a tier
Within a tier, prefer:
- earlier match position
- more matched tokens
- title > slug > body (except Tier 0 identity)

### Recency behavior
Recency is a tie-breaker only:
- within the same tier, OR
- when scores differ by < ~5%

Recency input order:
- updatedAt
- createdAt
- file mtime (if applicable)

### Final ordering
Sort by:
1) tier asc  
2) score desc  
3) updatedAt desc  
4) slug asc (deterministic)

---

## Snippets + Highlighting

### Highlighting
- Highlight matched substrings in title/slug/snippet
- Minimal styling; no heavy UI

### Snippet rules
- Title/slug-only match:
  - snippet = first non-empty body line (max 120 chars) or empty
- Body match:
  - excerpt around first match (~40 chars before, ~60 after)
- Always single-line, sanitized preview

---

## UX Spec (Modal behavior)

### Entry points
- Desktop: Cmd/Ctrl + K opens modal, input focused
- Mobile: existing FAB tap opens same modal

### Default state (empty query)
- Show recent notes (updatedAt desc), capped at 12

### Typing
- Results update on debounce (40–80ms)
- Avoid result thrashing; keep scroll stable

### Keyboard navigation
- ArrowUp / ArrowDown moves active selection
- Enter:
  - if selection active → navigate to note
  - else:
    - if Tier 0 best match exists → navigate
    - else → create new note with query as title/first line
- Tab (optional):
  - enters selection mode (select first result)
  - Esc or Ctrl+Tab exits selection mode

### Escape behavior
Single Esc priority:
1) exit selection mode (keep query)
2) clear query
3) close modal

Optional: double-Esc closes immediately.

### Touch behavior
- Tap result navigates immediately
- Results scroll inside modal; input pinned
- No viewport jank on keyboard open

### Empty results state
Display:
- “No matches. Press Enter to create: {query}”

---

## Integration Points
- Reuse routing by slug
- Reuse quick capture “Enter creates note”
- Reuse wiki-link autocomplete row patterns where possible

---

## Acceptance Criteria
1) Fully offline; no network calls.
2) Searches title, slug, body with body snippets.
3) Exact slug/title always outranks partial/fuzzy.
4) Empty query shows recent notes.
5) Keyboard navigation works end-to-end.
6) Mobile-safe: no freezing or viewport jump.
7) Deterministic ordering for identical inputs.
8) Fuzzy activates only under defined conditions.