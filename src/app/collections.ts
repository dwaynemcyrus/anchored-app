import type { AnchoredDocument } from "./documents";
import { fileTypeLabel, fileTypeForName } from "./fileTypes";

export type DocumentGroup = {
  documents: AnchoredDocument[];
  name: string;
};

export type VaultCollections = {
  archive: AnchoredDocument[];
  assets: AnchoredDocument[];
  assetGroups: DocumentGroup[];
  inbox: AnchoredDocument[];
  workbench: AnchoredDocument[];
  workbenchGroups: DocumentGroup[];
};

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareNames(left: string, right: string): number {
  return nameCollator.compare(left, right);
}

function sortedDocuments(documents: AnchoredDocument[]): AnchoredDocument[] {
  return [...documents].sort((left, right) =>
    compareNames(left.name, right.name),
  );
}

function normalizedStatus(document: AnchoredDocument): string {
  return document.status?.trim().toLocaleLowerCase() ?? "";
}

function groupedByType(documents: AnchoredDocument[]): DocumentGroup[] {
  const untyped: AnchoredDocument[] = [];
  const typed = new Map<string, DocumentGroup>();
  for (const document of documents) {
    const name = document.noteType?.trim();
    if (!name) {
      untyped.push(document);
      continue;
    }
    const key = name.toLocaleLowerCase();
    const group = typed.get(key) ?? { documents: [], name };
    group.documents.push(document);
    typed.set(key, group);
  }

  return [
    ...(untyped.length > 0
      ? [{ documents: sortedDocuments(untyped), name: "Untyped" }]
      : []),
    ...Array.from(typed.values())
      .sort((left, right) => compareNames(left.name, right.name))
      .map((group) => ({
        ...group,
        documents: sortedDocuments(group.documents),
      })),
  ];
}

function groupedAssets(documents: AnchoredDocument[]): DocumentGroup[] {
  const groups = new Map<string, AnchoredDocument[]>();
  for (const document of documents) {
    const name = fileTypeLabel(fileTypeForName(document.name));
    const group = groups.get(name) ?? [];
    group.push(document);
    groups.set(name, group);
  }
  return Array.from(groups, ([name, groupDocuments]) => ({
    documents: sortedDocuments(groupDocuments),
    name,
  })).sort((left, right) => compareNames(left.name, right.name));
}

export function buildVaultCollections(
  documents: AnchoredDocument[],
): VaultCollections {
  const inbox: AnchoredDocument[] = [];
  const workbench: AnchoredDocument[] = [];
  const archive: AnchoredDocument[] = [];
  const assets: AnchoredDocument[] = [];

  for (const document of documents) {
    if (document.isMarkdown === false) {
      assets.push(document);
      continue;
    }
    const status = normalizedStatus(document);
    if (!status || status === "inbox") inbox.push(document);
    else if (status === "archived") archive.push(document);
    else workbench.push(document);
  }

  const sortedInbox = sortedDocuments(inbox);
  const sortedWorkbench = sortedDocuments(workbench);
  const sortedArchive = sortedDocuments(archive);
  const sortedAssets = sortedDocuments(assets);
  return {
    archive: sortedArchive,
    assets: sortedAssets,
    assetGroups: groupedAssets(sortedAssets),
    inbox: sortedInbox,
    workbench: sortedWorkbench,
    workbenchGroups: groupedByType(sortedWorkbench),
  };
}
