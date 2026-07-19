import type { VaultSnapshot } from "../lib/tauri/vault";

export type DocumentSaveState =
  "saved" | "unsaved" | "saving" | "conflict" | "error";

export type AnchoredDocument = {
  id: string;
  name: string;
  outgoingLinks: string[];
  folder: string;
  folderPath?: string;
  title: string;
  aliases: string[];
  tags: string[];
  body: string;
  relativePath?: string;
  sourceText?: string;
  savedSourceText?: string;
  saveMessage?: string;
  saveState?: DocumentSaveState;
  sizeBytes?: number;
  relatedDocumentId?: string;
  relatedLabel?: string;
  isMarkdown?: boolean;
};

export function createUntitledDocument(
  documents: AnchoredDocument[],
): AnchoredDocument {
  const untitledCount = documents.filter((document) =>
    document.name.startsWith("Untitled"),
  ).length;
  const suffix = untitledCount === 0 ? "" : ` ${untitledCount + 1}`;
  const title = `Untitled${suffix}`;

  return {
    id: `draft-${crypto.randomUUID()}`,
    name: `${title}.md`,
    outgoingLinks: [],
    folder: "Vault root",
    folderPath: "",
    title,
    aliases: [],
    tags: [],
    body: "",
    saveState: "unsaved",
    sourceText: "",
  };
}

export function documentsFromVault(
  snapshot: VaultSnapshot,
): AnchoredDocument[] {
  const notes = snapshot.files.map((file) => ({
    id: `vault-path:${file.relativePath}`,
    name: file.name,
    outgoingLinks: file.outgoingLinks ?? [],
    folder: file.parent || snapshot.name,
    folderPath: file.parent,
    title: file.name.replace(/\.md$/i, ""),
    aliases: file.aliases ?? [],
    tags: [],
    body: "",
    relativePath: file.relativePath,
    saveState: "saved" as const,
    isMarkdown: true,
  }));
  const assets = (snapshot.assets ?? []).map((file) => ({
    id: `vault-path:${file.relativePath}`,
    name: file.name,
    outgoingLinks: [],
    folder: file.parent || snapshot.name,
    folderPath: file.parent,
    title: file.name,
    aliases: [],
    tags: [],
    body: "",
    relativePath: file.relativePath,
    saveState: "saved" as const,
    isMarkdown: false,
  }));
  return [...notes, ...assets];
}

export function mergeDocumentsFromVault(
  currentDocuments: AnchoredDocument[],
  snapshot: VaultSnapshot,
): AnchoredDocument[] {
  const currentByPath = new Map(
    currentDocuments.flatMap((document) =>
      document.relativePath ? [[document.relativePath, document]] : [],
    ),
  );
  const scannedPaths = new Set(
    [...snapshot.files, ...(snapshot.assets ?? [])].map(
      (file) => file.relativePath,
    ),
  );
  const incomingDocuments = documentsFromVault(snapshot);
  const scannedDocuments = incomingDocuments.map((document) => {
    const current = currentByPath.get(document.relativePath as string);
    return current
      ? {
          ...current,
          aliases: document.aliases,
          folder: document.folder,
          folderPath: document.folderPath,
          id: document.id,
          name: document.name,
          outgoingLinks: document.outgoingLinks,
          relativePath: document.relativePath,
          title: document.title,
        }
      : document;
  });
  const localOrDirtyMissingDocuments = currentDocuments.filter(
    (document) =>
      !document.relativePath ||
      (!scannedPaths.has(document.relativePath) &&
        document.saveState !== undefined &&
        document.saveState !== "saved"),
  );

  return [...scannedDocuments, ...localOrDirtyMissingDocuments];
}

export function folderPathsFromVault(snapshot: VaultSnapshot): string[] {
  const paths = snapshot.folders ?? snapshot.files.map((file) => file.parent);
  return Array.from(
    new Set(paths.filter((path) => path.trim().length > 0)),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}
