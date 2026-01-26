# Build Spec — Document Templates v1

Purpose:
Extend the template system with management UI and insert-into-document capability.

Builds on: `document-templates-v0-spec.md`

---

## 0) Scope / Non-Goals

### In scope
- Settings UI: Manage Templates section
- Create new custom template (blank with scaffold)
- Insert template into existing document at cursor
- Frontmatter merge on insert

### Not in scope
- Template sync across devices
- Template sharing/import/export
- Template folders/organization
- Conditional template logic

---

## 1) Settings: Manage Templates

Add a "Manage Templates" section to Settings that allows users to view, create, and manage templates.

### UI Structure

```
Settings
├── Data
│   └── Backup & Restore
└── Templates
    ├── Manage Templates  →  (new page)
    └── Reset All Templates
```

### Manage Templates Page

Display all templates grouped by type:

```
Manage Templates

[+ Create Template]

Built-in
├── Capture
├── Note
├── Reference
├── Source
│   ├── Book
│   ├── Podcast
│   └── Article
├── Journal
├── Daily
└── Essay

Custom
├── Recipe
└── Book Notes
```

Each template item shows:
- Template name (title)
- Target type / subtype
- "Edit" action → opens template in document editor
- "Reset" action (built-in only) → restores default
- "Delete" action (custom only) → removes template

---

## 2) Create New Template

### Trigger
"Create Template" button in Manage Templates page.

### Behavior
1. Create new document with scaffold content:

```yaml
---
type: note
title: ""
tags: []
---
```

2. Navigate to document editor with new template open
3. User modifies as needed and saves

### Scaffold defaults
- `templateFor: note` (most common type)
- Example frontmatter block in body
- User changes `templateFor`, `title`, and body content

Note: Template metadata (`type: _template`, `templateFor`, `isBuiltIn`, etc.) is stored in document meta, not in the template body.

---

## 3) Insert Template into Document

Allow users to insert template content into an existing document at the cursor position.

### Trigger options
- Keyboard shortcut (e.g., `Cmd/Ctrl+Shift+T`)
- Command palette entry (future)
- Editor toolbar button (future)

### Flow
1. User triggers "Insert Template" while editing a document
2. Template picker modal appears (reuse existing component)
3. User selects a template
4. Template content inserted at cursor position
5. Frontmatter fields merged (if applicable)

### Frontmatter merge behavior

When inserting a template into a document that already has frontmatter:

1. **Parse** existing document frontmatter
2. **Parse** template frontmatter (from template body)
3. **Merge** fields:
   - Template fields are added to existing frontmatter
   - Existing fields are NOT overwritten
   - Arrays are concatenated (deduplicated)
   - `type` field is NOT changed (document keeps its type)
   - `id`, `createdAt`, `updatedAt` are NOT copied from template

4. **Insert** template body content (after frontmatter block) at cursor

### Example

**Existing document:**
```yaml
---
type: note
title: "My Note"
tags: [personal]
---
Some existing content.
```

**Template (Book Notes):**
```yaml
---
type: note
subtype: book-notes
title: ""
bookTitle: ""
author: ""
tags: [books]
---

## Summary

## Key Ideas

## Quotes
```

**Result after insert:**
```yaml
---
type: note
title: "My Note"
subtype: book-notes
bookTitle: ""
author: ""
tags: [personal, books]
---
Some existing content.

## Summary

## Key Ideas

## Quotes
```

### Merge rules summary

| Field | Behavior |
|-------|----------|
| `type` | Keep existing (never overwrite) |
| `id`, `createdAt`, `updatedAt` | Keep existing (never copy) |
| `title` | Keep existing if non-empty, else use template |
| Arrays (e.g., `tags`) | Concatenate and deduplicate |
| Other fields | Add if missing, keep existing if present |

---

## 4) Data Model Updates

No schema changes required. Existing template structure supports all features.

---

## 5) Integration Points

### Settings
- New "Manage Templates" link in Templates section
- New page: `/settings/templates`

### Editor
- Keyboard shortcut handler for insert template
- CodeMirror integration for cursor position + content insertion
- Frontmatter parsing and serialization

### Template Picker
- Add `mode` prop: `"create"` (default) or `"insert"`
- In insert mode, selecting template returns template data instead of creating document

---

## 6) Implementation Chunks

### Chunk 1: Manage Templates page
- Create `/settings/templates` page
- List all templates grouped by type
- Edit/Delete/Reset actions

### Chunk 2: Create Template flow
- "Create Template" button
- Scaffold generation
- Navigate to editor

### Chunk 3: Insert Template - UI
- Keyboard shortcut binding
- Template picker in insert mode
- Modal integration in editor

### Chunk 4: Insert Template - Merge logic
- Frontmatter parsing
- Merge algorithm
- Content insertion at cursor

---

## 7) Acceptance Criteria

- [ ] Manage Templates page lists all templates
- [ ] Built-in templates show "Edit" and "Reset" actions
- [ ] Custom templates show "Edit" and "Delete" actions
- [ ] "Create Template" creates scaffold and opens editor
- [ ] Keyboard shortcut opens template picker in insert mode
- [ ] Selecting template inserts content at cursor
- [ ] Frontmatter fields are merged correctly
- [ ] Existing fields are not overwritten
- [ ] Arrays are concatenated and deduplicated
- [ ] `type`, `id`, `createdAt` are preserved

---

## 8) Decisions Log

| Question | Decision |
|----------|----------|
| Create template approach | Blank with scaffold (not form) |
| Frontmatter on insert | Merge fields (additive) |
| Type field on insert | Never overwrite |
| Array merge | Concatenate + deduplicate |

---

END SPEC
