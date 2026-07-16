import type { VaultSnapshot } from "../lib/tauri/vault";

export type AnchoredDocument = {
  id: string;
  name: string;
  folder: string;
  title: string;
  aliases: string[];
  tags: string[];
  body: string;
  relativePath?: string;
  sourceText?: string;
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
    folder: "Notes",
    title: "Reading Notes",
    aliases: [],
    tags: ["reading"],
    body: "Highlights become useful when they return to active thought.",
  },
  {
    id: "weekly-review",
    name: "Weekly Review.md",
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
    folder: "Notes",
    title,
    aliases: [],
    tags: [],
    body: "",
  };
}

export function documentsFromVault(
  snapshot: VaultSnapshot,
): AnchoredDocument[] {
  return snapshot.files.map((file) => ({
    id: `vault:${file.relativePath}`,
    name: file.name,
    folder: file.parent || snapshot.name,
    title: file.name.replace(/\.md$/i, ""),
    aliases: [],
    tags: [],
    body: "",
    relativePath: file.relativePath,
  }));
}
