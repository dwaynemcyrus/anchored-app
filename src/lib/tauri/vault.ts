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

export function selectVault(): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("select_vault");
}

export function rescanVault(): Promise<VaultSnapshot | null> {
  return invoke<VaultSnapshot | null>("rescan_vault");
}
