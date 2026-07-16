import type { VaultSnapshot } from "../lib/tauri/vault";

export type DocumentSaveState =
  "saved" | "unsaved" | "saving" | "conflict" | "error";

export type AnchoredDocument = {
  id: string;
  name: string;
  outgoingLinks: string[];
  folder: string;
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
};

export const initialFolders: string[] = [
  "Notes",
  "Writing",
  "Journal",
  "Archive",
];

export const initialDocuments: AnchoredDocument[] = [
  {
    id: "leadership",
    name: "Leadership.md",
    outgoingLinks: ["Reading Notes"],
    folder: "Notes",
    title: "Leadership",
    aliases: ["Leading Well"],
    tags: ["thinking"],
    body: "A calm system should make connections visible without getting in the way.",
    relatedDocumentId: "reading-notes",
    relatedLabel: "Reading Notes",
  },
  {
    id: "reading-notes",
    name: "Reading Notes.md",
    outgoingLinks: [],
    folder: "Notes",
    title: "Reading Notes",
    aliases: [],
    tags: ["reading"],
    body: "Highlights become useful when they return to active thought.",
  },
  {
    id: "weekly-review",
    name: "Weekly Review.md",
    outgoingLinks: [],
    folder: "Notes",
    title: "Weekly Review",
    aliases: [],
    tags: ["review"],
    body: "Review what changed, then choose what deserves attention next.",
  },
];

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
    folder: "Notes",
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
  return snapshot.files.map((file) => ({
    id: file.id ? `vault-id:${file.id}` : `vault-path:${file.relativePath}`,
    name: file.name,
    outgoingLinks: file.outgoingLinks ?? [],
    folder: file.parent || snapshot.name,
    title: file.name.replace(/\.md$/i, ""),
    aliases: file.aliases ?? [],
    tags: [],
    body: "",
    relativePath: file.relativePath,
    saveState: "saved",
  }));
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
  const currentById = new Map(
    currentDocuments.map((document) => [document.id, document]),
  );
  const scannedPaths = new Set(snapshot.files.map((file) => file.relativePath));
  const incomingDocuments = documentsFromVault(snapshot);
  const scannedIds = new Set(incomingDocuments.map((document) => document.id));
  const scannedDocuments = incomingDocuments.map((document) => {
    const current =
      currentById.get(document.id) ??
      currentByPath.get(document.relativePath as string);
    return current
      ? {
          ...current,
          aliases: document.aliases,
          folder: document.folder,
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
      (!scannedIds.has(document.id) &&
        !scannedPaths.has(document.relativePath) &&
        document.saveState !== undefined &&
        document.saveState !== "saved"),
  );

  return [...scannedDocuments, ...localOrDirtyMissingDocuments];
}
