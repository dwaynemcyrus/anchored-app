import { useCallback, useMemo, useState, type RefObject } from "react";

import { readErrorMessage } from "./errors";
import type { AnchoredDocument } from "./documents";
import {
  applyVaultTimestampMigration,
  previewVaultTimestampMigration,
  type TimestampMigrationPreview,
  type VaultSnapshot,
} from "../lib/tauri/vault";

type TimestampMigrationDependencies = {
  adoptVaultSnapshot: (snapshot: VaultSnapshot) => void;
  documentsRef: RefObject<AnchoredDocument[]>;
  vaultSelected: boolean;
};

export type TimestampMigrationApi = {
  applyTimestampMigration: () => Promise<void>;
  previewTimestampMigration: () => Promise<void>;
  reset: () => void;
  timestampMigrationBusy: boolean;
  timestampMigrationError: string | undefined;
  timestampMigrationMessage: string | undefined;
  timestampMigrationPreview: TimestampMigrationPreview | undefined;
};

/// Owns the Settings timestamp-migration preview/apply flow: its preview,
/// busy/error/message state, and the two mutations. Extracted from App.tsx
/// following the useTrashPanel pattern. The returned object is memoized so
/// callers that list it as a dependency do not recreate on every render.
export function useTimestampMigration({
  adoptVaultSnapshot,
  documentsRef,
  vaultSelected,
}: TimestampMigrationDependencies): TimestampMigrationApi {
  const [timestampMigrationPreview, setTimestampMigrationPreview] =
    useState<TimestampMigrationPreview>();
  const [timestampMigrationBusy, setTimestampMigrationBusy] = useState(false);
  const [timestampMigrationError, setTimestampMigrationError] =
    useState<string>();
  const [timestampMigrationMessage, setTimestampMigrationMessage] =
    useState<string>();

  const previewTimestampMigration = useCallback(async () => {
    if (!vaultSelected) {
      setTimestampMigrationError("Open a vault before previewing timestamps.");
      return;
    }
    setTimestampMigrationBusy(true);
    setTimestampMigrationError(undefined);
    setTimestampMigrationMessage(undefined);
    try {
      setTimestampMigrationPreview(await previewVaultTimestampMigration());
    } catch (error) {
      setTimestampMigrationError(readErrorMessage(error));
    } finally {
      setTimestampMigrationBusy(false);
    }
  }, [vaultSelected]);

  const applyTimestampMigration = useCallback(async () => {
    const preview = timestampMigrationPreview;
    if (!vaultSelected || !preview || timestampMigrationBusy) return;
    if (
      documentsRef.current.some(
        (document) =>
          document.saveState === "saving" || document.saveState === "conflict",
      )
    ) {
      setTimestampMigrationError(
        "Finish saving or resolving note conflicts before migrating timestamps.",
      );
      return;
    }

    setTimestampMigrationBusy(true);
    setTimestampMigrationError(undefined);
    setTimestampMigrationMessage(undefined);
    try {
      const result = await applyVaultTimestampMigration(
        preview.candidates.map(
          ({ expectedModifiedMillis, expectedSizeBytes, relativePath }) => ({
            expectedModifiedMillis,
            expectedSizeBytes,
            relativePath,
          }),
        ),
      );
      adoptVaultSnapshot(result.snapshot);
      const applied = result.outcomes.filter(
        (outcome) => outcome.status === "applied",
      );
      const conflicts = result.outcomes.filter(
        (outcome) => outcome.status === "conflict",
      );
      const errors = result.outcomes.filter(
        (outcome) => outcome.status === "error",
      );
      setTimestampMigrationPreview(undefined);
      setTimestampMigrationMessage(
        `Normalized ${applied.length} file${applied.length === 1 ? "" : "s"}.` +
          (conflicts.length > 0
            ? ` ${conflicts.length} changed after preview.`
            : "") +
          (errors.length > 0 ? ` ${errors.length} could not be updated.` : ""),
      );
    } catch (error) {
      setTimestampMigrationError(readErrorMessage(error));
    } finally {
      setTimestampMigrationBusy(false);
    }
  }, [
    adoptVaultSnapshot,
    documentsRef,
    timestampMigrationBusy,
    timestampMigrationPreview,
    vaultSelected,
  ]);

  const reset = useCallback(() => {
    setTimestampMigrationPreview(undefined);
    setTimestampMigrationBusy(false);
    setTimestampMigrationError(undefined);
    setTimestampMigrationMessage(undefined);
  }, []);

  return useMemo(
    () => ({
      applyTimestampMigration,
      previewTimestampMigration,
      reset,
      timestampMigrationBusy,
      timestampMigrationError,
      timestampMigrationMessage,
      timestampMigrationPreview,
    }),
    [
      applyTimestampMigration,
      previewTimestampMigration,
      reset,
      timestampMigrationBusy,
      timestampMigrationError,
      timestampMigrationMessage,
      timestampMigrationPreview,
    ],
  );
}
