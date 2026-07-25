import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { AnchoredDocument } from "./documents";
import { readErrorMessage } from "./errors";
import type { WikilinkCandidate } from "./linkCandidates";
import type { NewNotificationHistoryEntry } from "./notificationHistory";
import { rankQuickOpenResults, type QuickOpenResult } from "./retrieval";
import {
  rescanVault,
  searchVault,
  type VaultSnapshot,
} from "../lib/tauri/vault";
import type { VaultSearchState } from "./components/VaultSearchPalette";

type VaultNoticeOptions = {
  history?: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">;
  persistent?: boolean;
};

type RetrievalPalettesDependencies = {
  activeDocumentId: string;
  addHistoryEntry: (
    message: string,
    input: Omit<NewNotificationHistoryEntry, "id" | "message" | "scopeId">,
  ) => void;
  addVaultNotice: (text: string, options?: VaultNoticeOptions) => void;
  adoptVaultSnapshot: (snapshot: VaultSnapshot) => void;
  deferredDocuments: AnchoredDocument[];
  documentsRef: RefObject<AnchoredDocument[]>;
  selectDocument: (documentId: string) => Promise<void>;
  vaultSelected: boolean;
  wikilinkCandidates: WikilinkCandidate[];
};

export type RetrievalPalettesApi = {
  findRequest: number;
  openQuickOpen: () => void;
  openVaultSearch: () => void;
  openVaultSearchResult: (relativePath: string) => Promise<void>;
  quickOpenQuery: string;
  quickOpenResults: QuickOpenResult[];
  quickOpenVisible: boolean;
  reset: () => void;
  setQuickOpenQuery: (query: string) => void;
  setQuickOpenVisible: (visible: boolean) => void;
  setVaultSearchQuery: (query: string) => void;
  setVaultSearchVisible: (visible: boolean) => void;
  triggerFind: () => void;
  vaultSearchQuery: string;
  vaultSearchState: VaultSearchState;
  vaultSearchVisible: boolean;
};

/// Owns Quick Open, vault search, and find-in-note: their query/visibility
/// state, the ranked Quick Open results, the debounced vault-search effect,
/// and reopening a vault-search result. Extracted from App.tsx following
/// the useTrashPanel pattern. The shared keyboard-shortcut listener stays
/// in App.tsx (it also handles unrelated shortcuts) and calls this hook's
/// openQuickOpen/openVaultSearch/triggerFind methods. The returned object
/// is memoized so callers that list it as a dependency do not recreate on
/// every render.
export function useRetrievalPalettes({
  activeDocumentId,
  addHistoryEntry,
  addVaultNotice,
  adoptVaultSnapshot,
  deferredDocuments,
  documentsRef,
  selectDocument,
  vaultSelected,
  wikilinkCandidates,
}: RetrievalPalettesDependencies): RetrievalPalettesApi {
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState("");
  const [vaultSearchState, setVaultSearchState] = useState<VaultSearchState>({
    status: "idle",
  });
  const [vaultSearchVisible, setVaultSearchVisible] = useState(false);
  const [findRequest, setFindRequest] = useState(0);
  const searchRequestRef = useRef(0);

  const quickOpenResults = useMemo(
    () =>
      quickOpenVisible
        ? rankQuickOpenResults(
            wikilinkCandidates,
            deferredDocuments,
            quickOpenQuery,
            activeDocumentId,
          )
        : [],
    [
      activeDocumentId,
      deferredDocuments,
      quickOpenQuery,
      quickOpenVisible,
      wikilinkCandidates,
    ],
  );

  useEffect(() => {
    searchRequestRef.current += 1;
    const requestId = searchRequestRef.current;
    const query = vaultSearchQuery.trim();

    if (!vaultSearchVisible || !vaultSelected || query.length === 0) {
      setVaultSearchState({ status: "idle" });
      return;
    }

    setVaultSearchState({ status: "searching" });
    const timeout = window.setTimeout(() => {
      void searchVault(query)
        .then((result) => {
          if (searchRequestRef.current === requestId) {
            setVaultSearchState({ result, status: "success" });
          }
        })
        .catch((error: unknown) => {
          if (searchRequestRef.current === requestId) {
            setVaultSearchState({
              message: readErrorMessage(error),
              status: "error",
            });
          }
        });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [vaultSearchQuery, vaultSearchVisible, vaultSelected]);

  const openQuickOpen = useCallback(() => {
    setQuickOpenQuery("");
    setQuickOpenVisible(true);
  }, []);

  const openVaultSearch = useCallback(() => {
    setVaultSearchQuery("");
    setVaultSearchVisible(true);
  }, []);

  const triggerFind = useCallback(() => {
    setFindRequest((current) => current + 1);
  }, []);

  const openVaultSearchResult = useCallback(
    async (relativePath: string) => {
      let document = documentsRef.current.find(
        (candidate) => candidate.relativePath === relativePath,
      );
      if (!document) {
        try {
          const snapshot = await rescanVault();
          if (snapshot) {
            adoptVaultSnapshot(snapshot);
            document = documentsRef.current.find(
              (candidate) => candidate.relativePath === relativePath,
            );
          }
        } catch (error) {
          addVaultNotice(readErrorMessage(error), { persistent: true });
          addHistoryEntry("A vault search result could not be reopened.", {
            kind: "error",
          });
          return;
        }
      }

      if (!document) {
        addVaultNotice("That search result is no longer in the vault.", {
          history: { kind: "error" },
          persistent: true,
        });
        return;
      }
      setVaultSearchVisible(false);
      await selectDocument(document.id);
    },
    [
      addHistoryEntry,
      addVaultNotice,
      adoptVaultSnapshot,
      documentsRef,
      selectDocument,
    ],
  );

  const reset = useCallback(() => {
    setQuickOpenQuery("");
    setQuickOpenVisible(false);
    setVaultSearchQuery("");
    setVaultSearchVisible(false);
    setVaultSearchState({ status: "idle" });
  }, []);

  return useMemo(
    () => ({
      findRequest,
      openQuickOpen,
      openVaultSearch,
      openVaultSearchResult,
      quickOpenQuery,
      quickOpenResults,
      quickOpenVisible,
      reset,
      setQuickOpenQuery,
      setQuickOpenVisible,
      setVaultSearchQuery,
      setVaultSearchVisible,
      triggerFind,
      vaultSearchQuery,
      vaultSearchState,
      vaultSearchVisible,
    }),
    [
      findRequest,
      openQuickOpen,
      openVaultSearch,
      openVaultSearchResult,
      quickOpenQuery,
      quickOpenResults,
      quickOpenVisible,
      reset,
      triggerFind,
      vaultSearchQuery,
      vaultSearchState,
      vaultSearchVisible,
    ],
  );
}
