import { invoke } from "@tauri-apps/api/core";

export type VaultFile = {
  aliases?: string[];
  archivedAt?: string;
  createdAt?: string;
  name: string;
  noteType?: string;
  outgoingLinks?: string[];
  parent: string;
  relativePath: string;
  status?: string;
};

export type VaultAsset = {
  name: string;
  parent: string;
  relativePath: string;
};

export type VaultWarnings = {
  skippedNonUtf8Paths: number;
  skippedSymlinks: number;
};

export type VaultSnapshot = {
  assets?: VaultAsset[];
  files: VaultFile[];
  folders?: string[];
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
  isFolder?: boolean;
  name: string;
  originalPath: string;
  trashedAt: number;
};

export type TrashMutationResult = {
  entry: TrashEntry;
  snapshot: VaultSnapshot;
};

export type VaultDocument = {
  archivedAt?: string;
  content: string;
  createdAt?: string;
  noteType?: string;
  relativePath: string;
  sizeBytes: number;
  status?: string;
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

export type LifecycleVaultFileRequest = {
  expectedContent: string;
  relativePath: string;
};

export type RestoreArchivedVaultFileRequest = LifecycleVaultFileRequest & {
  destinationStatus: "active" | "inbox";
};

export type CreateVaultRequest = {
  name: string;
};

export type CreateVaultFolderRequest = {
  name: string;
  parentPath?: string;
};

export type RenameVaultFolderRequest = {
  folderPath: string;
  name: string;
};

export type RenameVaultFileResult = {
  relativePath: string;
  updatedFiles: number;
  updatedLinks: number;
};

export function selectVault(): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("select_vault");
}

export function createVault(
  request: CreateVaultRequest,
): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("create_vault", request);
}

export function createVaultFolder(
  request: CreateVaultFolderRequest,
): Promise<VaultSnapshot> {
  return invoke<VaultSnapshot>("create_vault_folder", request);
}

export function renameVaultFolder(
  request: RenameVaultFolderRequest,
): Promise<VaultSnapshot> {
  return invoke<VaultSnapshot>("rename_vault_folder", request);
}

export function deleteVaultFolder(folderPath: string): Promise<VaultSnapshot> {
  return invoke<VaultSnapshot>("delete_vault_folder", { folderPath });
}

export function moveVaultFolderToTrash(
  folderPath: string,
  confirmation: string,
): Promise<TrashMutationResult> {
  return invoke<TrashMutationResult>("move_vault_folder_to_trash", {
    confirmation,
    folderPath,
  });
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

export function restoreVaultFolderFromTrash(
  trashId: string,
): Promise<TrashMutationResult> {
  return invoke<TrashMutationResult>("restore_vault_folder_from_trash", {
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

export function archiveVaultFile(
  request: LifecycleVaultFileRequest,
): Promise<VaultDocument> {
  return invoke<VaultDocument>("archive_vault_file", request);
}

export function restoreArchivedVaultFile(
  request: RestoreArchivedVaultFileRequest,
): Promise<VaultDocument> {
  return invoke<VaultDocument>("restore_archived_vault_file", request);
}

export function createVaultFile(
  request: CreateVaultFileRequest,
): Promise<VaultDocument | null> {
  return invoke<VaultDocument | null>("create_vault_file", request);
}

export function createUntitledVaultFile(
  content: string,
): Promise<VaultDocument> {
  return invoke<VaultDocument>("create_untitled_vault_file", { content });
}

export function moveVaultFileToFolder(
  relativePath: string,
  destinationFolder: string,
): Promise<RenameVaultFileResult> {
  return invoke<RenameVaultFileResult>("move_vault_file_to_folder", {
    destinationFolder,
    relativePath,
  });
}

export function renameVaultFile(
  relativePath: string,
): Promise<RenameVaultFileResult | null> {
  return invoke<RenameVaultFileResult | null>("rename_vault_file", {
    relativePath,
  });
}
