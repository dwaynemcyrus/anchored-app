/**
 * Templates Module
 *
 * Exports template service and definitions.
 */

export * from "./types.js";
export * from "./definitions.js";
export {
  getTemplates,
  getTemplatesForType,
  getTemplate,
  getCaptureTemplate,
  createFromTemplate,
  resetBuiltInTemplate,
  resetAllBuiltInTemplates,
  createTemplateScaffold,
  prepareTemplateForInsertion,
  mergeFrontmatter,
  serializeFrontmatter,
} from "./templateService.js";
export { ensureBuiltInTemplates } from "./seedTemplates.js";
