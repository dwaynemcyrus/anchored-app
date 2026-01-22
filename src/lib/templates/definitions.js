/**
 * Built-in Template Definitions
 *
 * Default templates for all document types.
 * Users can edit these; "Reset to default" restores original.
 */

/**
 * @type {import('./types.js').BuiltInTemplateDefinition[]}
 */
export const BUILT_IN_TEMPLATES = [
  // Base types
  {
    id: "builtin-capture",
    templateFor: "capture",
    title: "Capture",
    body: `---
type: capture
title: ""
---`,
  },

  {
    id: "builtin-note",
    templateFor: "note",
    title: "Note",
    body: `---
type: note
title: ""
tags: []
---`,
  },

  {
    id: "builtin-reference",
    templateFor: "reference",
    title: "Reference",
    body: `---
type: reference
title: ""
tags: []
source: ""
---`,
  },

  {
    id: "builtin-source",
    templateFor: "source",
    title: "Source",
    body: `---
type: source
subtype: ""
title: ""
tags: []
url: ""
---`,
  },

  {
    id: "builtin-journal",
    templateFor: "journal",
    title: "Journal",
    body: `---
type: journal
title: ""
mood: ""
---`,
  },

  {
    id: "builtin-daily",
    templateFor: "daily",
    title: "Daily",
    body: `---
type: daily
title: "{{date}}"
---`,
  },

  {
    id: "builtin-essay",
    templateFor: "essay",
    title: "Essay",
    body: `---
type: essay
title: ""
tags: []
---`,
  },

  // Source subtypes
  {
    id: "builtin-source-book",
    templateFor: "source",
    templateForSubtype: "book",
    title: "Book",
    body: `---
type: source
subtype: book
title: ""
author: ""
tags: []
---`,
  },

  {
    id: "builtin-source-podcast",
    templateFor: "source",
    templateForSubtype: "podcast",
    title: "Podcast",
    body: `---
type: source
subtype: podcast
title: ""
host: ""
guests: []
tags: []
---`,
  },

  {
    id: "builtin-source-article",
    templateFor: "source",
    templateForSubtype: "article",
    title: "Article",
    body: `---
type: source
subtype: article
title: ""
url: ""
tags: []
---`,
  },
];

/**
 * Get a built-in template definition by ID
 * @param {string} id
 * @returns {import('./types.js').BuiltInTemplateDefinition | undefined}
 */
export function getBuiltInTemplateDefinition(id) {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get the capture template definition
 * @returns {import('./types.js').BuiltInTemplateDefinition}
 */
export function getCaptureTemplateDefinition() {
  return BUILT_IN_TEMPLATES.find((t) => t.templateFor === "capture");
}
