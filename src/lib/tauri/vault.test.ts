import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rescanVault, selectVault, type VaultSnapshot } from "./vault";

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
});
