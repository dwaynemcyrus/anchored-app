# Build Spec — Now View v1  


Today Note • Inbox Count • Workbench (Pinned Documents)

Status: Approved  
Target: Anchored OS  
Constraints: Local-first · Markdown-first · Notes-only · Offline · Single-user

---

## 0. Intent

Create a **Now View** that functions as the daily entry point for thinking.

This screen must:
- Give the user a place to think *now* (Today Note)
- Show what requires attention (Inbox count)
- Keep active work in sight (Workbench)

This is orientation, not optimization.

---

## 1. Route & Entry

### 1.1 Home Route
- Path: `/`
- Name: **Now View**

This replaces any previous “home” concept.

### 1.2 Required Existing Routes
- `INBOX_ROUTE` — dedicated Inbox page (existing)
- `DOC_DETAIL_ROUTE(id)` — document detail/editor route (existing)

---

## 2. Document System Contract

All documents follow the same rules.

### 2.1 Identity
- `id`: UUID (primary key, immutable)
- `slug`: string (deterministic, human-readable key)

### 2.2 Required Frontmatter (all docs)
```yaml
---
id: "<uuid>"
slug: "<string>"
type: "<string>"
status: "active | complete | archived | trashed"
---[[
```

Frontmatter is the source of truth.

---

## 3. Daily Note Specification

### 3.1 Purpose

The Daily Note is the working surface for the current day.

It is a normal markdown document.

### 3.2 Slug Convention

* Format: daily/YYYY-MM-DD
* Example: daily/2026-01-19
* Slug is deterministic and unique per day.

### 3.3 Required Frontmatter

```
---
id: "<uuid>"
slug: "daily/YYYY-MM-DD"
type: "daily"
date: "YYYY-MM-DD"
status: "active"
---
```

### 3.4 Creation Rules

* Daily notes are lazy-created
* Created only when:

  * User taps “Open Today”
  * OR first explicit attempt to write into Today

### 3.5 Find-or-Create Logic

1. Compute today’s date using user timezone (Europe/Zurich)
2. Generate slug: daily/YYYY-MM-DD
3. Query repo by slug
4. If found → open document
5. If not found → create document → open

⠀
### 3.6 Creation Details

* Body starts empty (frontmatter + blank line)
* Must not be marked inbox by default
* Must always be created with status: active
---

## 4. Inbox Integration

### 4.1 Definition

Inbox uses the existing schema already implemented in Anchored OS.

Do not introduce new inbox logic.

### 4.2 Inbox Count Rules

Inbox count includes documents where:

* Existing inbox condition is true
* status === "active"

Inbox count must exclude:

* type === "daily"
* status IN ("complete", "archived", "trashed")

### 4.3 UI

* Show count only
* No previews
* Tap navigates to INBOX_ROUTE
---

## 5. Workbench (Pinned Documents)

### 5.1 Purpose

Workbench holds documents the user is actively working on.

This is not a second notes list.

### 5.2 Storage

Persist in settings:

```
workbenchPinnedIds: string[] // ordered, max length = 5
```

### 5.3 Display Rules

Display pinned docs where:

* Document exists
* status === "active"

Exclude silently:

* Missing docs
* complete
* archived
* trashed

Workbench must never crash if pinned docs disappear.

Optional cleanup:

* Remove invalid IDs from settings on load.
---

## 6. Pinning Rules

### 6.1 Maximum

* Max pinned documents: 5

### 6.2 Pin Attempt Logic

When user attempts to pin newDocId:

#### Case A — Already pinned

* No-op
* Optional toast: “Already pinned”

#### Case B — Less than max

* Append ID
* Save settings
* Toast: “Pinned to Workbench”

#### Case C — At max (Replace Flow)

Trigger replacement flow.

---

## 7. Replace Flow (Required UX)

### 7.1 Modal

Title: “Workbench is full”

Subtitle: “Select a document to replace”

Modal lists current pinned documents:

* Title
* Optional updated date

### 7.2 Selection

* User selects one existing pinned document (oldId)

### 7.3 Swap

* Replace oldId with newDocId at same index
* Persist updated list

### 7.4 Confirmation

* Close modal
* Toast:

* “Replaced Old Title with New Title”

---

## 8. Unpinning

* Removing a pin deletes its ID from workbenchPinnedIds
* Toast: “Removed from Workbench”
---

## 9. Now View Layout

### Section A — Today

* Button: Open Today
* Displays current date
* Always available

### Section B — Inbox

* Label: Inbox (N)
* Tap navigates to Inbox route

### Section C — Workbench

* Title: “Workbench”
* List of pinned documents
* CTA: “Add to Workbench” (opens document picker/search)

No recents list. No previews.

---

## 10. Performance & Reliability

* All queries must be local and indexed where possible
* Now View must render fast on mobile
* Missing or malformed documents must not crash rendering
* Frontmatter parsing failures must degrade gracefully
---

## 11. Explicit Non-Goals

* Tasks or habits
* Sync or Supabase
* Backlinks or graph
* Templates or forced daily structure
* Inbox previews
* Recently touched lists on home
---

## 12. Acceptance Criteria

1. / renders Now View with Today, Inbox count, and Workbench
2. Today Note opens or creates correctly via slug
3. Inbox count matches rules and links to Inbox route
4. Workbench shows ≤5 active documents
5. Pinning past max triggers replace modal + confirmation toast
6. Deleted/archived/completed pinned docs do not crash UI
7. All functionality works offline

⠀
---

End of Spec