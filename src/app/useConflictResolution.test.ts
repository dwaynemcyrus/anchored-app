import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useConflictResolution } from "./useConflictResolution";

describe("useConflictResolution", () => {
  it("starts with no conflict dialog open", () => {
    const { result } = renderHook(() => useConflictResolution());
    expect(result.current.conflictResolutionDocumentId).toBeUndefined();
  });

  it("opens the dialog for a given document", () => {
    const { result } = renderHook(() => useConflictResolution());
    act(() => result.current.openConflictResolution("vault-path:a.md"));
    expect(result.current.conflictResolutionDocumentId).toBe("vault-path:a.md");
  });

  it("closes the dialog", () => {
    const { result } = renderHook(() => useConflictResolution());
    act(() => result.current.openConflictResolution("vault-path:a.md"));
    act(() => result.current.closeConflictResolution());
    expect(result.current.conflictResolutionDocumentId).toBeUndefined();
  });

  it("switches target when opened for a different document", () => {
    const { result } = renderHook(() => useConflictResolution());
    act(() => result.current.openConflictResolution("vault-path:a.md"));
    act(() => result.current.openConflictResolution("vault-path:b.md"));
    expect(result.current.conflictResolutionDocumentId).toBe("vault-path:b.md");
  });

  it("reset clears an open dialog", () => {
    const { result } = renderHook(() => useConflictResolution());
    act(() => result.current.openConflictResolution("vault-path:a.md"));
    act(() => result.current.reset());
    expect(result.current.conflictResolutionDocumentId).toBeUndefined();
  });

  it("keeps stable function identities across renders", () => {
    const { result, rerender } = renderHook(() => useConflictResolution());
    const first = result.current;
    rerender();
    expect(result.current.openConflictResolution).toBe(
      first.openConflictResolution,
    );
    expect(result.current.closeConflictResolution).toBe(
      first.closeConflictResolution,
    );
    expect(result.current.reset).toBe(first.reset);
    expect(result.current).toBe(first);
  });
});
