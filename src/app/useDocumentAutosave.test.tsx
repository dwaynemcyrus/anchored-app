import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDocumentAutosave } from "./useDocumentAutosave";

type Document = {
  id: string;
  relativePath?: string;
  savedSourceText?: string;
  saveState: "unsaved" | "saved" | "saving" | "conflict" | "error";
  sourceText?: string;
};

function AutosaveHarness({
  documents,
  saveDocument,
}: {
  documents: Document[];
  saveDocument: (documentId: string) => Promise<void>;
}) {
  useDocumentAutosave(documents, saveDocument);
  return null;
}

const dirtyDocument = (id: string): Document => ({
  id,
  relativePath: `${id}.md`,
  savedSourceText: "before",
  saveState: "unsaved",
  sourceText: "after",
});

describe("useDocumentAutosave", () => {
  it("saves every dirty document after its own delay", async () => {
    vi.useFakeTimers();
    const saveDocument = vi.fn().mockResolvedValue(undefined);
    render(
      <AutosaveHarness
        documents={[dirtyDocument("first"), dirtyDocument("second")]}
        saveDocument={saveDocument}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(saveDocument).toHaveBeenCalledWith("first");
    expect(saveDocument).toHaveBeenCalledWith("second");
  });

  it("keeps an inactive document's scheduled save when another tab changes", async () => {
    vi.useFakeTimers();
    const saveDocument = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AutosaveHarness
        documents={[dirtyDocument("inactive"), dirtyDocument("active")]}
        saveDocument={saveDocument}
      />,
    );

    rerender(
      <AutosaveHarness
        documents={[
          dirtyDocument("inactive"),
          { ...dirtyDocument("active"), sourceText: "newer edit" },
        ]}
        saveDocument={saveDocument}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(saveDocument).toHaveBeenCalledWith("inactive");
    expect(saveDocument).toHaveBeenCalledWith("active");
  });

  it("cancels a pending save once the document becomes clean", async () => {
    vi.useFakeTimers();
    const saveDocument = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AutosaveHarness
        documents={[dirtyDocument("note")]}
        saveDocument={saveDocument}
      />,
    );

    rerender(
      <AutosaveHarness
        documents={[
          {
            ...dirtyDocument("note"),
            saveState: "saved",
            sourceText: "after",
          },
        ]}
        saveDocument={saveDocument}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(saveDocument).not.toHaveBeenCalled();
  });
});
