import type { AnchoredDocument } from "./documents";
import {
  rankWikilinkCandidates,
  type WikilinkCandidate,
} from "./linkCandidates";

export type QuickOpenResult = {
  detail: string;
  documentId: string;
  label: string;
  matchedAlias?: string;
};

export function rankQuickOpenResults(
  candidates: WikilinkCandidate[],
  documents: AnchoredDocument[],
  query: string,
  currentDocumentId?: string,
  limit = 24,
): QuickOpenResult[] {
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const ranked = rankWikilinkCandidates(
    candidates,
    query,
    currentDocumentId,
    Math.max(limit * 3, 24),
  );
  const seen = new Set<string>();
  const results: QuickOpenResult[] = [];

  for (const candidate of ranked) {
    if (
      !candidate.documentId ||
      candidate.kind === "unresolved" ||
      seen.has(candidate.documentId)
    ) {
      continue;
    }
    const document = documentsById.get(candidate.documentId);
    if (!document) continue;

    seen.add(candidate.documentId);
    results.push({
      detail: document.relativePath ?? document.name,
      documentId: document.id,
      label: document.name.replace(/\.md$/i, ""),
      matchedAlias: candidate.kind === "alias" ? candidate.label : undefined,
    });
    if (results.length === limit) break;
  }

  return results;
}
