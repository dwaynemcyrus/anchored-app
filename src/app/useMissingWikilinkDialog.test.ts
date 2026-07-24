import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInboxVaultFile, rescanVault } from "../lib/tauri/vault";
import { useMissingWikilinkDialog } from "./useMissingWikilinkDialog";

vi.mock("../lib/tauri/vault", () => ({
  createInboxVaultFile: vi.fn(),
  rescanVault: vi.fn(),
}));

function setup() {
  const adoptVaultSnapshot = vi.fn();
  const selectDocument = vi.fn(async () => {});
  const setFocusDocument = vi.fn();
  const rendered = renderHook(() =>
    useMissingWikilinkDialog({
      adoptVaultSnapshot,
      selectDocument,
      setFocusDocument,
    }),
  );
  return { adoptVaultSnapshot, rendered, selectDocument, setFocusDocument };
}

describe("useMissingWikilinkDialog", () => {
  beforeEach(() => {
    vi.mocked(createInboxVaultFile).mockReset();
    vi.mocked(rescanVault).mockReset();
  });

  it("starts closed", () => {
    const { rendered } = setup();
    expect(rendered.result.current.missingWikilinkTarget).toBeUndefined();
  });

  it("opens with a target and clears any prior error", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.openMissingWikilinkDialog("Idea"));
    expect(rendered.result.current.missingWikilinkTarget).toBe("Idea");
    expect(rendered.result.current.missingWikilinkError).toBeUndefined();
  });

  it("closes when not creating", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.openMissingWikilinkDialog("Idea"));
    act(() => rendered.result.current.closeMissingWikilinkDialog());
    expect(rendered.result.current.missingWikilinkTarget).toBeUndefined();
  });

  it("creates the note, rescans, focuses, and selects it", async () => {
    vi.mocked(createInboxVaultFile).mockResolvedValue({
      relativePath: "inbox/Idea.md",
    } as never);
    vi.mocked(rescanVault).mockResolvedValue({ vaultId: "v1" } as never);
    const { adoptVaultSnapshot, rendered, selectDocument, setFocusDocument } =
      setup();

    act(() => rendered.result.current.openMissingWikilinkDialog("Idea"));
    await act(async () => {
      await rendered.result.current.createMissingWikilinkNote();
    });

    expect(createInboxVaultFile).toHaveBeenCalledWith({
      content: "",
      name: "Idea",
    });
    expect(adoptVaultSnapshot).toHaveBeenCalledWith({ vaultId: "v1" });
    expect(setFocusDocument).toHaveBeenCalledWith("vault-path:inbox/Idea.md");
    expect(selectDocument).toHaveBeenCalledWith("vault-path:inbox/Idea.md");
    expect(rendered.result.current.missingWikilinkTarget).toBeUndefined();
    expect(rendered.result.current.creatingMissingWikilink).toBe(false);
  });

  it("reports an error and keeps the dialog open when creation fails", async () => {
    vi.mocked(createInboxVaultFile).mockRejectedValue(new Error("disk full"));
    const { rendered } = setup();

    act(() => rendered.result.current.openMissingWikilinkDialog("Idea"));
    await act(async () => {
      await rendered.result.current.createMissingWikilinkNote();
    });

    expect(rendered.result.current.missingWikilinkTarget).toBe("Idea");
    expect(rendered.result.current.missingWikilinkError).toContain("disk full");
    expect(rendered.result.current.creatingMissingWikilink).toBe(false);
  });

  it("does not close the dialog while a creation is in flight", async () => {
    let resolveCreate!: (value: { relativePath: string }) => void;
    vi.mocked(createInboxVaultFile).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }) as never,
    );
    const { rendered } = setup();

    act(() => rendered.result.current.openMissingWikilinkDialog("Idea"));
    let creation!: Promise<void>;
    act(() => {
      creation = rendered.result.current.createMissingWikilinkNote();
    });
    expect(rendered.result.current.creatingMissingWikilink).toBe(true);

    act(() => rendered.result.current.closeMissingWikilinkDialog());
    expect(rendered.result.current.missingWikilinkTarget).toBe("Idea");

    vi.mocked(rescanVault).mockResolvedValue({ vaultId: "v1" } as never);
    await act(async () => {
      resolveCreate({ relativePath: "inbox/Idea.md" });
      await creation;
    });
  });

  it("reset clears target, error, and creating state", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.openMissingWikilinkDialog("Idea"));
    act(() => rendered.result.current.reset());
    expect(rendered.result.current.missingWikilinkTarget).toBeUndefined();
    expect(rendered.result.current.missingWikilinkError).toBeUndefined();
    expect(rendered.result.current.creatingMissingWikilink).toBe(false);
  });
});
