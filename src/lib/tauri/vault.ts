import { invoke } from "@tauri-apps/api/core";

export type VaultFile = {
  name: string;
  parent: string;
  relativePath: string;
};

export type VaultWarnings = {
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

export type SaveVaultFileRequest = {
  content: string;
  expectedContent: string;
  relativePath: string;
};

export type CreateVaultFileRequest = {
  content: string;
  suggestedName: string;
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
