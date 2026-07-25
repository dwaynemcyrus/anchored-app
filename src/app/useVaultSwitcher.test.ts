import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVault,
  forgetVault,
  listRememberedVaults,
  openRememberedVault,
  selectVault,
} from "../lib/tauri/vault";
import { useVaultSwitcher } from "./useVaultSwitcher";

vi.mock("../lib/tauri/vault", () => ({
  createVault: vi.fn(),
  forgetVault: vi.fn(),
  listRememberedVaults: vi.fn(),
  openRememberedVault: vi.fn(),
  selectVault: vi.fn(),
}));

function setup(vaultSelected = false) {
  const activateVaultSnapshot = vi.fn();
  const addVaultNotice = vi.fn();
  const hasUnfinishedEdits = vi.fn(() => false);
  const refreshTrashEntries = vi.fn(async () => {});
  const rendered = renderHook(() =>
    useVaultSwitcher({
      activateVaultSnapshot,
      addVaultNotice,
      hasUnfinishedEdits,
      refreshTrashEntries,
      vaultSelected,
    }),
  );
  return {
    activateVaultSnapshot,
    addVaultNotice,
    hasUnfinishedEdits,
    refreshTrashEntries,
    rendered,
  };
}

describe("useVaultSwitcher", () => {
  beforeEach(() => {
    vi.mocked(createVault).mockReset();
    vi.mocked(forgetVault).mockReset();
    vi.mocked(listRememberedVaults).mockReset().mockResolvedValue([]);
    vi.mocked(openRememberedVault).mockReset();
    vi.mocked(selectVault).mockReset();
  });

  it("starts with both dialogs closed and no remembered-vault error", () => {
    const { rendered } = setup();
    expect(rendered.result.current.vaultSwitcherVisible).toBe(false);
    expect(rendered.result.current.createVaultVisible).toBe(false);
    expect(rendered.result.current.rememberedVaultsError).toBeUndefined();
  });

  it("blocks opening a vault when there are unfinished edits", async () => {
    const { addVaultNotice, hasUnfinishedEdits, rendered } = setup(true);
    hasUnfinishedEdits.mockReturnValue(true);

    await act(async () => {
      await rendered.result.current.openVault();
    });

    expect(addVaultNotice).toHaveBeenCalledWith(
      "Save or close all draft changes before switching vaults.",
    );
    expect(selectVault).not.toHaveBeenCalled();
  });

  it("opens a vault, activates the snapshot, and closes the switcher", async () => {
    vi.mocked(selectVault).mockResolvedValue({
      files: [],
      vaultId: "v1",
    } as never);
    const { activateVaultSnapshot, refreshTrashEntries, rendered } = setup();

    act(() => rendered.result.current.setVaultSwitcherVisible(true));
    await act(async () => {
      await rendered.result.current.openVault();
    });

    expect(activateVaultSnapshot).toHaveBeenCalledWith({
      files: [],
      vaultId: "v1",
    });
    expect(rendered.result.current.vaultSwitcherVisible).toBe(false);
    expect(refreshTrashEntries).toHaveBeenCalled();
  });

  it("reports an error when vault selection fails", async () => {
    vi.mocked(selectVault).mockRejectedValue(new Error("no dialog"));
    const { addVaultNotice, rendered } = setup();

    await act(async () => {
      await rendered.result.current.openVault();
    });

    expect(addVaultNotice).toHaveBeenCalledWith(
      "Vault selection is available in the Anchored desktop app.",
      { history: { kind: "error" }, persistent: true },
    );
    expect(rendered.result.current.selectingVault).toBe(false);
  });

  it("creates a new vault and closes both dialogs", async () => {
    vi.mocked(createVault).mockResolvedValue({
      files: [],
      vaultId: "v2",
    } as never);
    const { activateVaultSnapshot, rendered } = setup();

    act(() => rendered.result.current.setCreateVaultVisible(true));
    await act(async () => {
      await rendered.result.current.createNewVault("New Vault");
    });

    expect(createVault).toHaveBeenCalledWith({ name: "New Vault" });
    expect(activateVaultSnapshot).toHaveBeenCalledWith({
      files: [],
      vaultId: "v2",
    });
    expect(rendered.result.current.createVaultVisible).toBe(false);
    expect(rendered.result.current.vaultSwitcherVisible).toBe(false);
  });

  it("reports a create-vault error without closing the dialog", async () => {
    vi.mocked(createVault).mockRejectedValue(new Error("name taken"));
    const { rendered } = setup();

    act(() => rendered.result.current.setCreateVaultVisible(true));
    await act(async () => {
      await rendered.result.current.createNewVault("Dup");
    });

    expect(rendered.result.current.createVaultError).toContain("name taken");
    expect(rendered.result.current.creatingVault).toBe(false);
  });

  it("opens a remembered vault by id", async () => {
    vi.mocked(openRememberedVault).mockResolvedValue({
      files: [],
      vaultId: "v3",
    } as never);
    const { activateVaultSnapshot, rendered } = setup();

    await act(async () => {
      await rendered.result.current.openKnownVault("v3");
    });

    expect(openRememberedVault).toHaveBeenCalledWith("v3");
    expect(activateVaultSnapshot).toHaveBeenCalledWith({
      files: [],
      vaultId: "v3",
    });
    expect(rendered.result.current.openingRememberedVaultId).toBeUndefined();
  });

  it("forgets a remembered vault and stores the updated list", async () => {
    vi.mocked(forgetVault).mockResolvedValue([
      { available: true, id: "v4", lastOpenedAt: 1, name: "Kept" },
    ]);
    const { rendered } = setup();

    await act(async () => {
      await rendered.result.current.forgetKnownVault("v3");
    });

    expect(rendered.result.current.rememberedVaults).toEqual([
      { available: true, id: "v4", lastOpenedAt: 1, name: "Kept" },
    ]);
  });

  it("opens the switcher directly when no vault is selected and none are remembered", () => {
    const { rendered } = setup(false);

    act(() => rendered.result.current.openSwitcher());

    expect(selectVault).toHaveBeenCalled();
    expect(rendered.result.current.vaultSwitcherVisible).toBe(false);
  });

  it("shows the switcher panel when remembered vaults exist", async () => {
    vi.mocked(listRememberedVaults).mockResolvedValue([
      { available: true, id: "v1", lastOpenedAt: 1, name: "Vault" },
    ]);
    const { rendered } = setup(false);
    await act(async () => {
      await rendered.result.current.refreshRememberedVaults();
    });

    act(() => rendered.result.current.openSwitcher());

    expect(rendered.result.current.vaultSwitcherVisible).toBe(true);
    expect(selectVault).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(rendered.result.current.rememberedVaultsLoading).toBe(false),
    );
  });

  it("reset closes both dialogs and clears the create-vault error", () => {
    const { rendered } = setup();
    act(() => {
      rendered.result.current.setVaultSwitcherVisible(true);
      rendered.result.current.setCreateVaultVisible(true);
      rendered.result.current.setCreateVaultError("boom");
    });

    act(() => rendered.result.current.reset());

    expect(rendered.result.current.vaultSwitcherVisible).toBe(false);
    expect(rendered.result.current.createVaultVisible).toBe(false);
    expect(rendered.result.current.createVaultError).toBeUndefined();
  });
});
