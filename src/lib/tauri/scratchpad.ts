import { invoke } from "@tauri-apps/api/core";

export type ScratchpadMode = "new" | "previous" | "list";

export type ScratchpadDocument = {
  body: string;
  persistedContent: string;
  relativePath: string;
};

export type ScratchpadLinkCandidate = {
  label: string;
  target: string;
};

export type ScratchpadListItem = {
  createdAt?: string;
  modifiedMillis: number;
  name: string;
  relativePath: string;
};

export function openScratchpad(mode: ScratchpadMode): Promise<void> {
  return invoke("open_scratchpad", { mode });
}

export function createScratchpadNote(
  body: string,
): Promise<ScratchpadDocument> {
  return invoke("create_scratchpad_note", { body });
}

export function saveScratchpadNote(request: {
  body: string;
  expectedContent: string;
  relativePath: string;
}): Promise<ScratchpadDocument> {
  return invoke("save_scratchpad_note", request);
}

export function latestScratchpadNote(): Promise<ScratchpadDocument | null> {
  return invoke("latest_scratchpad_note");
}

export function listScratchpadNotes(): Promise<ScratchpadListItem[]> {
  return invoke("list_scratchpad_notes");
}

export function readScratchpadNote(
  relativePath: string,
): Promise<ScratchpadDocument> {
  return invoke("read_scratchpad_note", { relativePath });
}

export function loadScratchpadLinkCandidates(): Promise<
  ScratchpadLinkCandidate[]
> {
  return invoke("scratchpad_link_candidates");
}
