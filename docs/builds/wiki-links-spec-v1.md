# Build Spec — Wiki-Links v1 + Autocomplete (Required)


Status: Approved
Target: Anchored OS
Constraints: Local-first · Markdown-first · Notes-only · Offline · No tasks · No sync

---

## 0) Intent

Enable Obsidian-style wiki-links with *necessary* autocomplete so linking becomes a first-class writing action:

- Typing `[[` opens a suggestion menu.
- Selecting a suggestion inserts a valid wiki-link.
- If no match exists, user can create a new note from the menu.
- Rendered wiki-links are clickable and open the target note.
- If a clicked link has no target, it creates it with a modal/toast confirm; options are create or cancel

This creates “link gravity” and makes Today Note + Workbench actually connect.

---

## 1) Definitions

### 1.1 Wiki-link syntax
- Canonical form: `[[TARGET]]`
- TARGET is plain text (no pipes/aliases in v1).
- Valid characters: any except `]]` terminator (trim whitespace on both ends).

### 1.2 Target resolution model
A wiki-link target resolves to a single document via:
1) Exact match by `slug` (frontmatter.slug)
2) Exact match by `title` (document title field or derived first heading, per existing app rules)
3) If still not found: “missing target” (create-on-open behavior applies)

### 1.3 Exclusions
Do not suggest or resolve to docs with:
- `status: trashed`
.

---

## 2) Repository Requirements

### 2.1 Required indexed fields
The local index must expose for each document:
- `id: string` (UUID)
- `title: string`
- `slug: string | null`
- `status: "active" | "complete" | "archived" | "trashed"`
- `updatedAt: number | ISO`

If slug is absent for non-daily docs, treat as null.

### 2.2 Query API (to implement or adapt)
Provide functions (or equivalent):
- `searchDocsForLink(query: string, limit: number): DocMeta[]`
  - should search title and slug (prefix + substring)
  - should rank intelligently (see ranking rules)
- `findDocByExactSlug(slug: string): DocMeta | null`
- `findDocByExactTitle(title: string): DocMeta | null`
- `createDocFromTitle(title: string): DocMeta` (creates markdown doc + standard frontmatter)

---

## 3) Autocomplete UX (Required)

### 3.1 Trigger
Autocomplete opens when:
- User types `[[`
- Cursor is inside an unclosed wiki-link (after `[[` and before `]]`)

Autocomplete closes when:
- User presses Escape
- User navigates cursor outside the active `[[...]]` region
- User completes `]]`
- User selects an option (inserts and closes)

### 3.2 Active query extraction
When autocomplete is open:
- Determine the active link region:
  - start = nearest `[[` before cursor with no intervening `]]`
  - end = cursor position (query end)
- `rawQuery` = text between `[[` and cursor
- `query` = rawQuery trimmed (but preserve rawQuery for insertion)

### 3.3 Menu content
Menu shows up to N suggestions (default N=8):
- Existing docs that match query
- Plus a “Create” option when:
  - query length > 0
  - no exact match by slug or title

Each suggestion item shows:
- Primary: title
- Secondary (small): slug if present OR last-updated date
Keep it minimal.

### 3.4 Ranking rules (important)
Rank suggestions by:
1) Exact slug match (starts-with slug or equals slug)
2) Exact title match
3) Prefix match on title
4) Substring match on title
5) Prefix match on slug
6) Substring match on slug
Tie-breakers:
- status active > complete > archived
- more recently updated higher
- shorter title higher (optional)

### 3.5 Keyboard controls
While menu open:
- ArrowDown / ArrowUp: move selection
- Enter: accept selection
- Tab: accept selection (optional; recommended)
- Escape: close menu
- Continue typing: refilter live

On mobile:
- Tap to select item
- Provide adequate hit targets

### 3.6 Insertion behavior (on accept)
When user selects a suggestion with doc meta (id/title/slug):
- Replace the active query region (between `[[` and cursor) with a normalized target string:
  - Default target string = doc.title
  - If user typed something containing a `/` and it matches a slug-style pattern, you MAY insert slug instead
    - v1 default: always insert title (simple + readable)
- Ensure the link is closed:
  - if `]]` already exists ahead, do not duplicate
  - else insert `]]`
- Place cursor after closing `]]`

When user selects “Create ‘X’”:
- Create doc using `createDocFromTitle(X)`
- Insert `[[X]]` (title-based)
- Navigate immediately to the new doc OR keep user in place (DECISION below)

Decision (v1 default):
- Do NOT auto-navigate on create from autocomplete.
- Rationale: user is writing; creation is just to establish link.
- Link click later can navigate. (Optional: cmd/ctrl+enter to create+open in v1.1)

---

## 4) Rendered Wiki-Link Behavior

### 4.1 Rendering
In preview/rendered mode, occurrences of `[[TARGET]]` must be styled as links.

### 4.2 Click behavior
On click:
- Resolve TARGET:
  1) exact slug match
  2) exact title match
- If found: navigate to `DOC_DETAIL_ROUTE(doc.id)`
- If not found:
  - create doc from title TARGET (status active, standard frontmatter)
  - navigate to it

Note:
- TARGET should be trimmed for resolution and creation.
- If TARGET is empty, do nothing.

---

## 5) Editor Integration (Recommended: CodeMirror 6)

### 5.1 Implementation approach (CM6)
Use an autocomplete source that activates when:
- text before cursor matches `$begin:math:display$\\\[\[\^$end:math:display$]*$`
- and cursor is within an open link region

Steps:
- Detect active region boundaries (`[[` start)
- Provide completions from `searchDocsForLink(query)`
- Include “Create …” completion when applicable
- On apply, replace region text and insert `]]` if missing

### 5.2 Avoid heavy parsing
Do not parse the entire document AST on every keystroke.
Use localized scanning near cursor and cached metadata index.

---

## 6) Data Creation Rules (Create Doc)

### 6.1 Standard frontmatter for new docs (non-daily)
New doc created via link should include:
```yaml
---
id: "<uuid>"
slug: "<optional or generated if your system supports it>"
type: "note"
status: "active"
---
```

Title:

* Use the created title as the doc title (per your existing title rules).

Slug for regular notes:

* If you already generate slugs, do so.
* If not, slug can be omitted for general notes in v1.
---

## 7) Status Rules

### 7.1 Suggestions

Exclude:

* trashed

* Default exclude:
* archived

* Optionally exclude:
* complete (recommended: include complete; people link to finished notes)

### 7.2 Resolution

Allow resolving to archived/complete if explicitly linked.

---

## 8) Acceptance Criteria

1. Typing [[ opens autocomplete.
2. Suggestions filter live as user types.
3. Enter selects a suggestion and inserts a closed link [[Title]], placing cursor after ]].
4. If no match exists, menu offers “Create ‘X’”.
5. Selecting “Create ‘X’” creates a new note (status active) and inserts [[X]] without navigating away from current doc.
6. Rendered [[TARGET]] is clickable; click opens existing doc or creates it and opens it.
7. No crashes on missing metadata or deleted docs; autocomplete handles empty index gracefully.
8. Works offline.

⠀
---

## 9) Non-goals (v1)

* Aliases: [[Target|Alias]]
* Backlinks panel
* Graph view
* Rename propagation
* Nested/embedded links
* Tag autocomplete
* Cross-vault references
---

## 10) Implementation Notes

* Maintain a fast, cached “docs index” in memory with title/slug/status/updatedAt.
* Debounce search queries lightly (e.g., 50–100ms) to avoid thrash on mobile.
* Ensure menu positioning works with iOS Safari keyboard viewport quirks (use existing shell viewport truth rules).
* Provide a single source of truth for resolving by slug/title to avoid divergence between autocomplete and click navigation.

End.