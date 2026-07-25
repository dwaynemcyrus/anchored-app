import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyVaultTimestampMigration,
  previewVaultTimestampMigration,
} from "../lib/tauri/vault";
import { useTimestampMigration } from "./useTimestampMigration";

vi.mock("../lib/tauri/vault", () => ({
  applyVaultTimestampMigration: vi.fn(),
  previewVaultTimestampMigration: vi.fn(),
}));

function setup(vaultSelected = true) {
  const adoptVaultSnapshot = vi.fn();
  const documentsRef = { current: [] as { saveState?: string }[] };
  const rendered = renderHook(() =>
    useTimestampMigration({
      adoptVaultSnapshot,
      documentsRef: documentsRef as never,
      vaultSelected,
    }),
  );
  return { adoptVaultSnapshot, documentsRef, rendered };
}

describe("useTimestampMigration", () => {
  beforeEach(() => {
    vi.mocked(applyVaultTimestampMigration).mockReset();
    vi.mocked(previewVaultTimestampMigration).mockReset();
  });

  it("starts with no preview, error, or message", () => {
    const { rendered } = setup();
    expect(rendered.result.current.timestampMigrationPreview).toBeUndefined();
    expect(rendered.result.current.timestampMigrationError).toBeUndefined();
    expect(rendered.result.current.timestampMigrationMessage).toBeUndefined();
    expect(rendered.result.current.timestampMigrationBusy).toBe(false);
  });

  it("reports an error instead of previewing when no vault is open", async () => {
    const { rendered } = setup(false);
    await act(async () => {
      await rendered.result.current.previewTimestampMigration();
    });
    expect(rendered.result.current.timestampMigrationError).toBe(
      "Open a vault before previewing timestamps.",
    );
    expect(previewVaultTimestampMigration).not.toHaveBeenCalled();
  });

  it("previews and stores the result", async () => {
    const preview = {
      candidates: [],
      changedValues: 0,
      issues: [],
      scannedFiles: 3,
    };
    vi.mocked(previewVaultTimestampMigration).mockResolvedValue(preview);
    const { rendered } = setup();

    await act(async () => {
      await rendered.result.current.previewTimestampMigration();
    });

    expect(rendered.result.current.timestampMigrationPreview).toEqual(preview);
    expect(rendered.result.current.timestampMigrationBusy).toBe(false);
  });

  it("reports a preview error", async () => {
    vi.mocked(previewVaultTimestampMigration).mockRejectedValue(
      new Error("disk full"),
    );
    const { rendered } = setup();

    await act(async () => {
      await rendered.result.current.previewTimestampMigration();
    });

    expect(rendered.result.current.timestampMigrationError).toContain(
      "disk full",
    );
    expect(rendered.result.current.timestampMigrationBusy).toBe(false);
  });

  it("blocks apply while a note is saving or in conflict", async () => {
    const preview = {
      candidates: [
        {
          expectedModifiedMillis: 1,
          expectedSizeBytes: 2,
          relativePath: "Note.md",
          changes: [],
        },
      ],
      changedValues: 1,
      issues: [],
      scannedFiles: 1,
    };
    vi.mocked(previewVaultTimestampMigration).mockResolvedValue(preview);
    const { documentsRef, rendered } = setup();
    await act(async () => {
      await rendered.result.current.previewTimestampMigration();
    });
    documentsRef.current = [{ saveState: "saving" }];

    await act(async () => {
      await rendered.result.current.applyTimestampMigration();
    });

    expect(rendered.result.current.timestampMigrationError).toBe(
      "Finish saving or resolving note conflicts before migrating timestamps.",
    );
    expect(applyVaultTimestampMigration).not.toHaveBeenCalled();
  });

  it("applies the migration, adopts the snapshot, and summarizes outcomes", async () => {
    const preview = {
      candidates: [
        {
          expectedModifiedMillis: 1,
          expectedSizeBytes: 2,
          relativePath: "Note.md",
          changes: [],
        },
      ],
      changedValues: 1,
      issues: [],
      scannedFiles: 1,
    };
    vi.mocked(previewVaultTimestampMigration).mockResolvedValue(preview);
    vi.mocked(applyVaultTimestampMigration).mockResolvedValue({
      outcomes: [
        { changedValues: 1, relativePath: "Note.md", status: "applied" },
      ],
      snapshot: { files: [], vaultId: "v1" } as never,
    });
    const { adoptVaultSnapshot, rendered } = setup();
    await act(async () => {
      await rendered.result.current.previewTimestampMigration();
    });

    await act(async () => {
      await rendered.result.current.applyTimestampMigration();
    });

    expect(adoptVaultSnapshot).toHaveBeenCalledWith({
      files: [],
      vaultId: "v1",
    });
    expect(rendered.result.current.timestampMigrationPreview).toBeUndefined();
    expect(rendered.result.current.timestampMigrationMessage).toBe(
      "Normalized 1 file.",
    );
  });

  it("reset clears preview, busy, error, and message", async () => {
    vi.mocked(previewVaultTimestampMigration).mockRejectedValue(
      new Error("disk full"),
    );
    const { rendered } = setup();
    await act(async () => {
      await rendered.result.current.previewTimestampMigration();
    });

    act(() => rendered.result.current.reset());

    expect(rendered.result.current.timestampMigrationPreview).toBeUndefined();
    expect(rendered.result.current.timestampMigrationError).toBeUndefined();
    expect(rendered.result.current.timestampMigrationMessage).toBeUndefined();
    expect(rendered.result.current.timestampMigrationBusy).toBe(false);
  });
});
