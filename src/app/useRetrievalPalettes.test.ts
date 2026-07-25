import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchoredDocument } from "./documents";
import type { WikilinkCandidate } from "./linkCandidates";
import { rescanVault, searchVault } from "../lib/tauri/vault";
import { useRetrievalPalettes } from "./useRetrievalPalettes";

vi.mock("../lib/tauri/vault", () => ({
  rescanVault: vi.fn(),
  searchVault: vi.fn(),
}));

function setup(documents: AnchoredDocument[] = [], vaultSelected = true) {
  const addHistoryEntry = vi.fn();
  const addVaultNotice = vi.fn();
  const adoptVaultSnapshot = vi.fn();
  const documentsRef = { current: documents };
  const selectDocument = vi.fn(async () => {});
  const rendered = renderHook(() =>
    useRetrievalPalettes({
      activeDocumentId: "",
      addHistoryEntry,
      addVaultNotice,
      adoptVaultSnapshot,
      deferredDocuments: documents,
      documentsRef: documentsRef as never,
      selectDocument,
      vaultSelected,
      wikilinkCandidates: [] as WikilinkCandidate[],
    }),
  );
  return {
    addHistoryEntry,
    addVaultNotice,
    adoptVaultSnapshot,
    documentsRef,
    rendered,
    selectDocument,
  };
}

describe("useRetrievalPalettes", () => {
  beforeEach(() => {
    vi.mocked(rescanVault).mockReset();
    vi.mocked(searchVault).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with both palettes closed and find untriggered", () => {
    const { rendered } = setup();
    expect(rendered.result.current.quickOpenVisible).toBe(false);
    expect(rendered.result.current.vaultSearchVisible).toBe(false);
    expect(rendered.result.current.findRequest).toBe(0);
  });

  it("opens Quick Open with a cleared query", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.setQuickOpenQuery("stale"));

    act(() => rendered.result.current.openQuickOpen());

    expect(rendered.result.current.quickOpenVisible).toBe(true);
    expect(rendered.result.current.quickOpenQuery).toBe("");
  });

  it("opens vault search with a cleared query", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.setVaultSearchQuery("stale"));

    act(() => rendered.result.current.openVaultSearch());

    expect(rendered.result.current.vaultSearchVisible).toBe(true);
    expect(rendered.result.current.vaultSearchQuery).toBe("");
  });

  it("increments findRequest each time triggerFind is called", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.triggerFind());
    act(() => rendered.result.current.triggerFind());

    expect(rendered.result.current.findRequest).toBe(2);
  });

  it("debounces and runs a vault search once a query is visible", async () => {
    vi.useFakeTimers();
    vi.mocked(searchVault).mockResolvedValue({
      matches: [],
      searchedFiles: 3,
      skippedFiles: 0,
      truncated: false,
    });
    const { rendered } = setup();

    act(() => rendered.result.current.openVaultSearch());
    act(() => rendered.result.current.setVaultSearchQuery("idea"));
    expect(rendered.result.current.vaultSearchState).toEqual({
      status: "searching",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(searchVault).toHaveBeenCalledWith("idea");
    expect(rendered.result.current.vaultSearchState.status).toBe("success");
  });

  it("stays idle when the search query is blank", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.openVaultSearch());

    expect(rendered.result.current.vaultSearchState).toEqual({
      status: "idle",
    });
    expect(searchVault).not.toHaveBeenCalled();
  });

  it("reopens a vault search result already in memory", async () => {
    const document = {
      id: "vault-path:Idea.md",
      relativePath: "Idea.md",
    } as AnchoredDocument;
    const { rendered, selectDocument } = setup([document]);
    act(() => rendered.result.current.setVaultSearchVisible(true));

    await act(async () => {
      await rendered.result.current.openVaultSearchResult("Idea.md");
    });

    expect(rescanVault).not.toHaveBeenCalled();
    expect(selectDocument).toHaveBeenCalledWith("vault-path:Idea.md");
    expect(rendered.result.current.vaultSearchVisible).toBe(false);
  });

  it("rescans to find a result missing from the current document list", async () => {
    const document = {
      id: "vault-path:New.md",
      relativePath: "New.md",
    } as AnchoredDocument;
    const { adoptVaultSnapshot, documentsRef, rendered, selectDocument } =
      setup([]);
    vi.mocked(rescanVault).mockImplementation(async () => {
      documentsRef.current = [document];
      return { files: [], vaultId: "v1" } as never;
    });

    await act(async () => {
      await rendered.result.current.openVaultSearchResult("New.md");
    });

    expect(adoptVaultSnapshot).toHaveBeenCalled();
    expect(selectDocument).toHaveBeenCalledWith("vault-path:New.md");
  });

  it("reports an error when a result cannot be found after rescanning", async () => {
    vi.mocked(rescanVault).mockResolvedValue({
      files: [],
      vaultId: "v1",
    } as never);
    const { addVaultNotice, rendered } = setup([]);

    await act(async () => {
      await rendered.result.current.openVaultSearchResult("Missing.md");
    });

    expect(addVaultNotice).toHaveBeenCalledWith(
      "That search result is no longer in the vault.",
      { history: { kind: "error" }, persistent: true },
    );
  });

  it("reports an error and logs history when the rescan itself fails", async () => {
    vi.mocked(rescanVault).mockRejectedValue(new Error("disk full"));
    const { addHistoryEntry, addVaultNotice, rendered } = setup([]);

    await act(async () => {
      await rendered.result.current.openVaultSearchResult("Missing.md");
    });

    expect(addVaultNotice).toHaveBeenCalledWith("disk full", {
      persistent: true,
    });
    expect(addHistoryEntry).toHaveBeenCalledWith(
      "A vault search result could not be reopened.",
      { kind: "error" },
    );
  });

  it("reset closes both palettes and clears their query/search state", () => {
    const { rendered } = setup();
    act(() => {
      rendered.result.current.setQuickOpenQuery("a");
      rendered.result.current.setQuickOpenVisible(true);
      rendered.result.current.setVaultSearchQuery("b");
      rendered.result.current.setVaultSearchVisible(true);
    });

    act(() => rendered.result.current.reset());

    expect(rendered.result.current.quickOpenVisible).toBe(false);
    expect(rendered.result.current.quickOpenQuery).toBe("");
    expect(rendered.result.current.vaultSearchVisible).toBe(false);
    expect(rendered.result.current.vaultSearchQuery).toBe("");
    expect(rendered.result.current.vaultSearchState).toEqual({
      status: "idle",
    });
  });
});
