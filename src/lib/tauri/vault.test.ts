import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readVaultFile,
  rescanVault,
  saveVaultFile,
  selectVault,
  type SaveVaultFileRequest,
  type VaultDocument,
  type VaultSnapshot,
} from "./vault";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const snapshot: VaultSnapshot = {
  files: [
    {
      name: "Leadership.md",
      parent: "Notes",
      relativePath: "Notes/Leadership.md",
    },
  ],
  name: "Personal",
  warnings: {
    skippedNonUtf8Paths: 0,
    skippedSymlinks: 0,
  },
};

const document: VaultDocument = {
  content: "# Leadership\n",
  relativePath: "Notes/Leadership.md",
  sizeBytes: 13,
};

const saveRequest: SaveVaultFileRequest = {
  content: "# Updated leadership\n",
  expectedContent: "# Leadership\n",
  relativePath: "Notes/Leadership.md",
};

describe("vault bridge", () => {
  beforeEach(() => mockedInvoke.mockReset());

  it("selects a vault through the Rust-owned dialog command", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(selectVault()).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledWith("select_vault");
  });

  it("rescans only the vault retained by Rust state", async () => {
    mockedInvoke.mockResolvedValue(snapshot);

    await expect(rescanVault()).resolves.toEqual(snapshot);
    expect(mockedInvoke).toHaveBeenCalledWith("rescan_vault");
  });

  it("reads a relative file through the retained Rust vault", async () => {
    mockedInvoke.mockResolvedValue(document);

    await expect(readVaultFile("Notes/Leadership.md")).resolves.toEqual(
      document,
    );
    expect(mockedInvoke).toHaveBeenCalledWith("read_vault_file", {
      relativePath: "Notes/Leadership.md",
    });
  });

  it("saves through the retained Rust vault with an expected revision", async () => {
    mockedInvoke.mockResolvedValue({
      ...document,
      content: saveRequest.content,
    });

    await expect(saveVaultFile(saveRequest)).resolves.toEqual({
      ...document,
      content: saveRequest.content,
    });
    expect(mockedInvoke).toHaveBeenCalledWith("save_vault_file", saveRequest);
  });
});
