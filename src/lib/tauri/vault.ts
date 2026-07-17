import { invoke } from "@tauri-apps/api/core";

export type VaultFile = {
  aliases?: string[];
  id?: string;
  name: string;
  outgoingLinks?: string[];
  parent: string;
  relativePath: string;
};

export type VaultWarnings = {
  addedIdentities: number;
  identityConflicts: number;
  needsIdentity: number;
  skippedNonUtf8Paths: number;
  skippedSymlinks: number;
};

export type VaultSnapshot = {
  files: VaultFile[];
  name: string;
  warnings: VaultWarnings;
};

export type VaultDocument = {
  content: string;
  relativePath: string;
  sizeBytes: number;
};

export type VaultSearchResult = {
  matches: Array<{
    line: number;
    relativePath: string;
    snippet: string;
  }>;
  searchedFiles: number;
  skippedFiles: number;
  truncated: boolean;
};

export type SaveVaultFileRequest = {
  content: string;
  expectedContent: string;
  relativePath: string;
};

export type CreateVaultFileRequest = {
  content: string;
  suggestedName: string;
};

export type RenameVaultFileResult = {
  relativePath: string;
  updatedFiles: number;
  updatedLinks: number;
};

export type IdentityMigrationPreview = {
  eligibleFiles: string[];
  issues: Array<{
    reason:
      | "duplicateIdentity"
      | "duplicateIdField"
      | "invalidIdentity"
      | "malformedFrontMatter";
    relativePath: string;
  }>;
};

export type IdentityMigrationResult = {
  migrated: number;
  skipped: number;
  snapshot: VaultSnapshot;
};

export function selectVault(): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("select_vault");
}

export function rescanVault(): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("rescan_vault");
}

export function readVaultFile(relativePath: string): Promise<VaultDocument> {
  return invoke<VaultDocument>("read_vault_file", { relativePath });
}

export function searchVault(query: string): Promise<VaultSearchResult> {
  return invoke<VaultSearchResult>("search_vault", { query });
}

export function saveVaultFile(
  request: SaveVaultFileRequest,
): Promise<VaultDocument> {
  return invoke<VaultDocument>("save_vault_file", request);
}

export function createVaultFile(
  request: CreateVaultFileRequest,
): Promise<VaultDocument | null> {
  return invoke<VaultDocument | null>("create_vault_file", request);
}

export function renameVaultFile(
  relativePath: string,
): Promise<RenameVaultFileResult | null> {
  return invoke<RenameVaultFileResult | null>("rename_vault_file", {
    relativePath,
  });
}

export function previewIdentityMigration(): Promise<IdentityMigrationPreview> {
  return invoke<IdentityMigrationPreview>("preview_identity_migration");
}

export function applyIdentityMigration(): Promise<IdentityMigrationResult> {
  return invoke<IdentityMigrationResult>("apply_identity_migration");
}
