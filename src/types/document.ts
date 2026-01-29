export type Document = {
  id: string;
  type: string;
  slug: string | null;
  title: string | null;
  body: string;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  version?: number | null;
  deletedAt?: number | null;
  archivedAt?: number | null;
};

export const DOCUMENT_TYPE_NOTE = "note";
export const DOCUMENT_TYPE_DAILY = "daily";
export const DOCUMENT_TYPE_TEMPLATE = "_template";
export const DOCUMENT_TYPE_INBOX = "inbox";
export const DOCUMENT_TYPE_REFERENCE = "reference";
export const DOCUMENT_TYPE_SOURCE = "source";
export const DOCUMENT_TYPE_JOURNAL = "journal";
export const DOCUMENT_TYPE_ESSAY = "essay";
export const DOCUMENT_TYPE_STAGED = "staged";
export const DOCUMENT_TYPE_TASK = "task";
export const DOCUMENT_TYPE_PROJECT = "project";
export const DOCUMENT_TYPE_HABIT = "habit";
export const DOCUMENT_TYPE_TIME_ENTRY = "time_entry";
