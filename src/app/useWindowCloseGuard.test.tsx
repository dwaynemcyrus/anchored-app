import { act, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWindowCloseGuard } from "./useWindowCloseGuard";

const close = vi.fn().mockResolvedValue(undefined);
let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close,
    onCloseRequested: vi.fn().mockImplementation((handler) => {
      closeHandler = handler;
      return Promise.resolve(vi.fn());
    }),
  }),
}));

type Document = {
  id: string;
  relativePath?: string;
  savedSourceText?: string;
  saveState: "unsaved" | "saved" | "saving" | "conflict" | "error";
  sourceText?: string;
};

function CloseGuardHarness({
  initialDocuments,
  onBlocked,
  onSave,
}: {
  initialDocuments: Document[];
  onBlocked: (message: string) => void;
  onSave: (documentId: string) => Promise<void>;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  useWindowCloseGuard({
    documents,
    onBlocked,
    saveDocument: async (documentId) => {
      await onSave(documentId);
      setDocuments((current) =>
        current.map((document) =>
          document.id === documentId
            ? {
                ...document,
                savedSourceText: document.sourceText,
                saveState: "saved",
              }
            : document,
        ),
      );
    },
  });
  return null;
}

const dirtyDocument = (id: string): Document => ({
  id,
  relativePath: `${id}.md`,
  savedSourceText: "before",
  saveState: "unsaved",
  sourceText: "after",
});

describe("useWindowCloseGuard", () => {
  beforeEach(() => {
    close.mockClear();
    closeHandler = undefined;
  });

  it("saves every dirty document before closing the window", async () => {
    const onBlocked = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseGuardHarness
        initialDocuments={[dirtyDocument("left"), dirtyDocument("right")]}
        onBlocked={onBlocked}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(closeHandler).toBeTypeOf("function"));
    const preventDefault = vi.fn();

    act(() => closeHandler?.({ preventDefault }));

    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith("left");
    expect(onSave).toHaveBeenCalledWith("right");
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("keeps the window open when a conflict needs attention", async () => {
    const onBlocked = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CloseGuardHarness
        initialDocuments={[{ ...dirtyDocument("note"), saveState: "conflict" }]}
        onBlocked={onBlocked}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(closeHandler).toBeTypeOf("function"));
    const preventDefault = vi.fn();

    act(() => closeHandler?.({ preventDefault }));

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith(
      "Resolve note save problems before closing Anchored.",
    );
  });
});
