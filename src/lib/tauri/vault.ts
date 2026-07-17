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
  vaultId?: string;
  warnings: VaultWarnings;
};

export type RememberedVault = {
  available: boolean;
  id: string;
  lastOpenedAt: number;
  name: string;
};

export type TrashEntry = {
  id: string;
  name: string;
  originalPath: string;
  trashedAt: number;
};

export type TrashMutationResult = {
  entry: TrashEntry;
  snapshot: VaultSnapshot;
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

export function listRememberedVaults(): Promise<RememberedVault[]> {
  return invoke<RememberedVault[]>("list_remembered_vaults");
}

export function openRememberedVault(vaultId: string): Promise<VaultSnapshot> {
  return invoke<VaultSnapshot>("open_remembered_vault", { vaultId });
}

export function forgetVault(vaultId: string): Promise<RememberedVault[]> {
  return invoke<RememberedVault[]>("forget_vault", { vaultId });
}

export function rescanVault(): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("rescan_vault");
}

export function listVaultTrash(): Promise<TrashEntry[]> {
  return invoke<TrashEntry[]>("list_vault_trash");
}

export function moveVaultFileToTrash(
  relativePath: string,
): Promise<TrashMutationResult> {
  return invoke<TrashMutationResult>("move_vault_file_to_trash", {
    relativePath,
  });
}

export function restoreVaultFileFromTrash(
  trashId: string,
): Promise<TrashMutationResult> {
  return invoke<TrashMutationResult>("restore_vault_file_from_trash", {
    trashId,
  });
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
