import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSidebarState } from "./useSidebarState";

describe("useSidebarState", () => {
  it("starts with no expanded folders", () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.expandedFolders.size).toBe(0);
  });

  it("exposes setExpandedFolders for direct control", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() =>
      result.current.setExpandedFolders(new Set(["Notes", "Notes/Sub"])),
    );
    expect(Array.from(result.current.expandedFolders).sort()).toEqual([
      "Notes",
      "Notes/Sub",
    ]);
  });

  it("reset clears expanded folders", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setExpandedFolders(new Set(["Notes"])));
    act(() => result.current.reset());
    expect(result.current.expandedFolders.size).toBe(0);
  });

  it("keeps stable setter identities across renders", () => {
    const { result, rerender } = renderHook(() => useSidebarState());
    const first = result.current;
    rerender();
    expect(result.current.setExpandedFolders).toBe(first.setExpandedFolders);
    expect(result.current.reset).toBe(first.reset);
    expect(result.current).toBe(first);
  });

  it("returns a new object identity only when its state actually changes", () => {
    const { result } = renderHook(() => useSidebarState());
    const first = result.current;
    act(() => result.current.setExpandedFolders(new Set(["Notes"])));
    expect(result.current).not.toBe(first);
  });
});
