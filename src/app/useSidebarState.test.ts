import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSidebarState } from "./useSidebarState";

describe("useSidebarState", () => {
  it("starts closed with no expanded folders", () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.expandedFolders.size).toBe(0);
  });

  it("toggles the sidebar open and closed", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarOpen).toBe(true);
    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarOpen).toBe(false);
  });

  it("exposes setSidebarOpen for direct control", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setSidebarOpen(true));
    expect(result.current.sidebarOpen).toBe(true);
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

  it("reset closes the sidebar and clears expanded folders", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => result.current.setSidebarOpen(true));
    act(() => result.current.setExpandedFolders(new Set(["Notes"])));
    act(() => result.current.reset());
    expect(result.current.sidebarOpen).toBe(false);
    expect(result.current.expandedFolders.size).toBe(0);
  });

  it("keeps stable setter identities across renders", () => {
    const { result, rerender } = renderHook(() => useSidebarState());
    const first = result.current;
    rerender();
    expect(result.current.setExpandedFolders).toBe(first.setExpandedFolders);
    expect(result.current.setSidebarOpen).toBe(first.setSidebarOpen);
    expect(result.current.toggleSidebar).toBe(first.toggleSidebar);
    expect(result.current.reset).toBe(first.reset);
    expect(result.current).toBe(first);
  });

  it("returns a new object identity only when its state actually changes", () => {
    const { result } = renderHook(() => useSidebarState());
    const first = result.current;
    act(() => result.current.toggleSidebar());
    expect(result.current).not.toBe(first);
  });
});
