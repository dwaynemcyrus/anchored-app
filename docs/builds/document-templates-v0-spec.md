# Build Spec — Document Templates v0

Purpose:
Enable type-aware document creation via templates. A template defines a document type. Creating a document means picking a template.

This is the Obsidian-style approach: templates are just files, no schema configuration, no required field markers, no user-facing validation.

---

## 0) Scope / Non-Goals

### In scope
- Define template storage format (raw frontmatter in body)
- Ship default templates for built-in types (capture, note, reference, source, journal, daily, essay)
- Subtype templates (e.g., source/book, source/podcast)
- Template picker UI for document creation
- Quick capture bypass (no picker)
- Custom template creation
- Built-in template editing

### Not in scope
- Schema validation or enforcement (system silently ensures basics)
- Required/optional field distinctions
- Template editing UI (users edit via document editor)
- Sync/backup of templates
- Migration of existing documents

---

## 1) Locked Terms

- **Template**: A document whose body contains raw frontmatter for a document type
- **Type**: The `type` value in the template's frontmatter content
- **Subtype**: The `subtype` value; subtypes can have their own templates
- **Built-in types**: capture, note, reference, source, journal, daily, essay

---

## 2) Template Storage

Templates are stored as documents with a reserved type.

```yaml
type: _template
templateFor: note
```

### Why not a separate folder?
- Unified storage model (templates are documents)
- Works with existing IndexedDB infrastructure
- No filesystem access needed (PWA constraint)

### Template document structure
```yaml
---
id: <unique-id>
type: _template
templateFor: <target-type>
templateForSubtype: <optional-subtype>
title: "Note Template"
createdAt: <iso-date>
isBuiltIn: true
---
<raw frontmatter block for new documents>
```

- `templateFor` — the document type this template creates
- `templateForSubtype` — optional; for subtype-specific templates
- `isBuiltIn` — true for default templates (non-deletable)

---

## 3) Default Templates

Ship these built-in templates. Users can edit them; "Reset to default" restores original.

### capture
```yaml
---
type: capture
title: ""
---
```

### note
```yaml
---
type: note
title: ""
tags: []
---
```

### reference
```yaml
---
type: reference
title: ""
tags: []
source: ""
---
```

### source (base)
```yaml
---
type: source
subtype: ""
title: ""
tags: []
url: ""
---
```

### source/book
```yaml
---
type: source
subtype: book
title: ""
author: ""
tags: []
---
```

### source/podcast
```yaml
---
type: source
subtype: podcast
title: ""
host: ""
guests: []
tags: []
---
```

### source/article
```yaml
---
type: source
subtype: article
title: ""
url: ""
tags: []
---
```

### journal
```yaml
---
type: journal
title: ""
mood: ""
---
```

### daily
```yaml
---
type: daily
title: "{{date}}"
---
```

### essay
```yaml
---
type: essay
title: ""
tags: []
---
```

### Template variables
- `{{createdAt}}` — ISO timestamp at creation
- `{{date}}` — YYYY-MM-DD date string

---

## 4) Template Picker UI

When user initiates "new document":

1. Show template picker (list of available templates)
2. User taps a template
3. New document created with template's frontmatter + body
4. Editor opens with new document

### Quick Capture
The "capture" action bypasses the template picker entirely:
1. Applies the Capture template
2. Sets `type: capture` automatically
3. Opens editor immediately

Speed is the priority. No picker, no decisions.

### UI constraints (mobile-first)
- Simple list or grid
- Group by type, then subtype
- Template name = title, or `templateFor` (capitalized) if no title
- Built-in templates appear first
- Custom templates follow

### Default template preference
- User can set a default template in settings
- Long-press "new document" → use default (skip picker)

---

## 5) Custom Templates

User creates a custom template by:

1. Creating a new document
2. Setting `type: _template` and `templateFor: <type>`
3. Optionally setting `templateForSubtype: <subtype>`
4. Writing raw frontmatter in the body
5. Saving

That template now appears in the template picker.

### Example: Recipe template (custom type)
```yaml
---
id: abc123
type: _template
templateFor: recipe
title: "Recipe"
createdAt: 2025-01-01T00:00:00Z
---
---
type: recipe
title: ""
servings: ""
prepTime: ""
cookTime: ""
ingredients: []
instructions: []
---
```

### Example: Book Notes template (subtype of note)
```yaml
---
id: def456
type: _template
templateFor: note
templateForSubtype: book-notes
title: "Book Notes"
createdAt: 2025-01-01T00:00:00Z
---
---
type: note
subtype: book-notes
title: ""
bookTitle: ""
author: ""
tags: []
---
```

---

## 6) Template Resolution

When creating a document from a template:

1. Parse template body as raw frontmatter (+ optional content below)
2. Replace template variables (`{{createdAt}}`, `{{date}}`)
3. **Silently inject required fields if missing:**
   - `id` — generate new unique ID
   - `createdAt` — current ISO timestamp
4. Create document with resolved frontmatter + body

### No validation
The system does not warn about missing fields. It silently ensures `id` and `createdAt` exist. All other fields are user's choice.

---

## 7) Changing Document Type

Templates are for creation only. After creation, a document is just a document.

### v0 behavior (this spec)
If user edits `type: note` → `type: source` in an existing document:
- Type field changes
- Existing fields remain as-is
- No fields added or removed
- No template re-applied

The document may have "note-like" fields but be typed as "source". This is allowed — no enforcement.

### Future enhancement (out of scope)
Prompt user when type changes:
> "Apply Source template? This will add missing fields but won't remove existing ones."

- Yes → merge template fields into document (additive only)
- No → just change the type value

This is deferred to a future spec.

---

## 8) Data Model

### Template document
```js
{
  id: string,
  type: "_template",
  templateFor: string,
  templateForSubtype?: string,
  title: string,
  body: string,              // Raw frontmatter block
  createdAt: string,
  updatedAt?: string,
  isBuiltIn?: boolean,       // true = non-deletable, resettable
}
```

### Template service (runtime)
```js
{
  getTemplates(): Template[]
  getTemplatesForType(type: string): Template[]
  getTemplate(id: string): Template | null
  createFromTemplate(templateId: string): Document
  resetBuiltInTemplate(templateId: string): void
}
```

---

## 9) Integration Points

### Document creation
- "New document" action → template picker
- "Capture" action → bypass picker, use capture template directly

### Settings
- "Default template" preference
- "Reset template to default" per built-in template
- "Reset all templates" option

### Existing frontmatter registry
- Remains internal (dev tooling, documentation)
- No user-facing integration

---

## 10) Tests

If test framework exists:
1. Template variable replacement works (`{{createdAt}}`, `{{date}}`)
2. Built-in templates load correctly
3. Custom template creation works
4. Subtype templates appear correctly in picker
5. Document creation from template produces valid document
6. Missing `id`/`createdAt` are silently injected
7. Capture bypass works (no picker shown)
8. Reset template restores original content

---

## 11) Acceptance Criteria

- [ ] Built-in templates exist for all 7 base types
- [ ] Subtype templates exist for source (book, podcast, article)
- [ ] Template picker appears on "new document" action
- [ ] Capture bypasses picker
- [ ] Selecting template creates document with correct frontmatter
- [ ] Users can create custom templates (type and subtype)
- [ ] Users can edit built-in templates
- [ ] Users can reset built-in templates to default
- [ ] Template variables are replaced correctly
- [ ] `id` and `createdAt` silently injected if missing
- [ ] Mobile-first UI works on iOS

---

## 12) Decisions Log

| Question | Decision |
|----------|----------|
| Template body format | Raw frontmatter block |
| Quick capture | Bypasses picker, applies Capture template, sets `type: capture` |
| Built-in template editing | Editable (with reset option) |
| Multiple templates per type | Yes, via subtypes |
| Schema validation | None user-facing; system silently ensures `id`/`createdAt` |
| Changing type on existing doc | v0: just edit the field, no template re-application |

---

## 13) Future Considerations (Out of Scope)

- Template merge prompt on type change (additive field merge)
- Template sync across devices
- Template sharing/import/export
- Additional template variables
- Template folders/organization
- Conditional template logic

---

END SPEC
