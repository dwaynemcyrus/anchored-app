import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNotifications } from "./useNotifications";

function setup(vaultId = "") {
  const vaultIdRef = { current: vaultId };
  const rendered = renderHook(() => useNotifications({ vaultIdRef }));
  return { rendered, vaultIdRef };
}

describe("useNotifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no toasts, a closed history panel, and empty history", () => {
    const { rendered } = setup();
    expect(rendered.result.current.vaultNotices).toEqual([]);
    expect(rendered.result.current.notificationHistoryVisible).toBe(false);
    expect(rendered.result.current.notificationHistory).toEqual([]);
  });

  it("adds a vault notice and dedupes identical text", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.addVaultNotice("Saved."));
    act(() => rendered.result.current.addVaultNotice("Saved."));

    expect(rendered.result.current.vaultNotices).toHaveLength(1);
    expect(rendered.result.current.vaultNotices[0]).toMatchObject({
      persistent: false,
      text: "Saved.",
    });
  });

  it("dismisses a specific notice by id", () => {
    const { rendered } = setup();
    act(() => rendered.result.current.addVaultNotice("First"));
    act(() => rendered.result.current.addVaultNotice("Second"));
    const [second, first] = rendered.result.current.vaultNotices;

    act(() => rendered.result.current.dismissVaultNotice(first.id));

    expect(rendered.result.current.vaultNotices).toEqual([second]);
  });

  it("auto-dismisses a non-persistent notice after the timeout", () => {
    vi.useFakeTimers();
    const { rendered } = setup();
    act(() => rendered.result.current.addVaultNotice("Transient"));

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(rendered.result.current.vaultNotices).toEqual([]);
  });

  it("keeps a persistent notice after the auto-dismiss timeout", () => {
    vi.useFakeTimers();
    const { rendered } = setup();
    act(() =>
      rendered.result.current.addVaultNotice("Sticky", { persistent: true }),
    );

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(rendered.result.current.vaultNotices).toHaveLength(1);
  });

  it("records a history entry alongside a vault notice", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addVaultNotice("Could not save.", {
        history: { kind: "error" },
      }),
    );

    expect(rendered.result.current.notificationHistory).toHaveLength(1);
    expect(rendered.result.current.notificationHistory[0]).toMatchObject({
      kind: "error",
      message: "Could not save.",
      scopeId: "vault-1",
    });
  });

  it("resolves history entries by source id within the active scope", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addHistoryEntry("Conflict detected.", {
        kind: "conflict",
        requiresAction: true,
        sourceId: "doc-1",
      }),
    );

    act(() => rendered.result.current.resolveHistorySource("doc-1"));

    expect(
      rendered.result.current.notificationHistory[0].resolvedAt,
    ).toBeDefined();
  });

  it("resolveHistoryEntry resolves by entry id", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addHistoryEntry("Conflict detected.", {
        kind: "conflict",
        requiresAction: true,
        sourceId: "doc-1",
      }),
    );
    const entryId = rendered.result.current.notificationHistory[0].id;

    act(() => rendered.result.current.resolveHistoryEntry(entryId));

    expect(
      rendered.result.current.notificationHistory[0].resolvedAt,
    ).toBeDefined();
  });

  it("deleteHistoryEntry removes an entry that doesn't require unresolved action", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addHistoryEntry("Saved.", { kind: "rename" }),
    );
    const entryId = rendered.result.current.notificationHistory[0].id;

    act(() => rendered.result.current.deleteHistoryEntry(entryId));

    expect(rendered.result.current.notificationHistory).toEqual([]);
  });

  it("deleteHistoryEntry keeps an entry that still requires action", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addHistoryEntry("Conflict detected.", {
        kind: "conflict",
        requiresAction: true,
        sourceId: "doc-1",
      }),
    );
    const entryId = rendered.result.current.notificationHistory[0].id;

    act(() => rendered.result.current.deleteHistoryEntry(entryId));

    expect(rendered.result.current.notificationHistory).toHaveLength(1);
  });

  it("clearResolvedHistory removes only resolved entries in the active scope", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addHistoryEntry("Conflict resolved.", {
        kind: "conflict",
        requiresAction: true,
        sourceId: "doc-1",
      }),
    );
    act(() => rendered.result.current.resolveHistorySource("doc-1"));

    act(() => rendered.result.current.clearResolvedHistory());

    expect(rendered.result.current.notificationHistory).toEqual([]);
  });

  it("persists notification history to localStorage", () => {
    const { rendered } = setup("vault-1");
    act(() =>
      rendered.result.current.addHistoryEntry("Saved.", { kind: "rename" }),
    );

    expect(
      window.localStorage.getItem("anchored.notification-history.v2"),
    ).toContain("Saved.");
  });

  it("reset clears vault notices and closes the history panel", () => {
    const { rendered } = setup();
    act(() => {
      rendered.result.current.addVaultNotice("Sticky", { persistent: true });
      rendered.result.current.setNotificationHistoryVisible(true);
    });

    act(() => rendered.result.current.reset());

    expect(rendered.result.current.vaultNotices).toEqual([]);
    expect(rendered.result.current.notificationHistoryVisible).toBe(false);
  });
});
