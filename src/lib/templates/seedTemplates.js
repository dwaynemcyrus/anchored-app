/**
 * Template Seeding
 *
 * Ensures built-in templates exist in the repository.
 * Called on app initialization.
 */

import { getDocumentsRepo } from "../repo/getDocumentsRepo.js";
import { DOCUMENT_TYPE_TEMPLATE } from "../../types/document.js";
import { BUILT_IN_TEMPLATES } from "./definitions.js";

/**
 * Ensure all built-in templates exist in the repository.
 * Creates missing templates, does not overwrite existing ones.
 * @returns {Promise<void>}
 */
export async function ensureBuiltInTemplates() {
  const repo = getDocumentsRepo();

  for (const definition of BUILT_IN_TEMPLATES) {
    const existing = await repo.get(definition.id);

    if (!existing) {
      await createBuiltInTemplate(repo, definition);
    }
  }
}

/**
 * Create a built-in template document
 * @param {import('../repo/IndexedDbDocumentsRepo.js').IndexedDbDocumentsRepo} repo
 * @param {import('./types.js').BuiltInTemplateDefinition} definition
 * @returns {Promise<void>}
 */
async function createBuiltInTemplate(repo, definition) {
  const now = Date.now();

  const template = {
    id: definition.id,
    type: DOCUMENT_TYPE_TEMPLATE,
    templateFor: definition.templateFor,
    templateForSubtype: definition.templateForSubtype || null,
    title: definition.title,
    body: definition.body,
    meta: {},
    slug: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    archivedAt: null,
    isBuiltIn: true,
  };

  // Use direct insert since we're bypassing the normal create flow
  await repo.insertTemplate(template);
}
