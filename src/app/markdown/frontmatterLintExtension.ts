import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

import { lintFrontmatter } from "./frontmatterLint";

const LINT_DELAY_MS = 500;

export const frontmatterLinter = linter(
  (view: EditorView): Diagnostic[] =>
    lintFrontmatter(view.state.doc.toString()).map((diagnostic) => ({
      from: diagnostic.from,
      to: diagnostic.to,
      message: diagnostic.message,
      severity: "warning",
      source: "frontmatter",
    })),
  { delay: LINT_DELAY_MS },
);

export const frontmatterLintGutter = lintGutter();
