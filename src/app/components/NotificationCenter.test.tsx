import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { NotificationHistoryEntry } from "../notificationHistory";
import { NotificationCenter } from "./NotificationCenter";

function entry(
  overrides: Partial<NotificationHistoryEntry> = {},
): NotificationHistoryEntry {
  return {
    count: 1,
    createdAt: Date.UTC(2026, 6, 17, 8),
    id: "event-1",
    kind: "vault",
    message: "Vault opened with 6 Markdown files.",
    requiresAction: false,
    scopeId: "vault-one",
    updatedAt: Date.UTC(2026, 6, 17, 8),
    ...overrides,
  };
}

describe("NotificationCenter", () => {
  it("shows timestamped records and restores focus after Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <NotificationCenter
        entries={[entry()]}
        onClearResolved={vi.fn()}
        onClose={onClose}
        onDelete={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Close notification history" }),
    ).toHaveFocus();
    expect(
      screen.getByText("Vault opened with 6 Markdown files."),
    ).toBeVisible();
    expect(screen.getByText("Vault")).toBeVisible();
    expect(
      screen.getByText("Last 28 days. Active conflicts remain until resolved."),
    ).toBeVisible();
    expect(screen.getByText(/2026/).closest("time")).toHaveAttribute(
      "dateTime",
      "2026-07-17T08:00:00.000Z",
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("deletes ordinary records and clears resolved history", async () => {
    const user = userEvent.setup();
    const onClearResolved = vi.fn();
    const onDelete = vi.fn();
    render(
      <NotificationCenter
        entries={[entry()]}
        onClearResolved={onClearResolved}
        onClose={vi.fn()}
        onDelete={onDelete}
        onResolve={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Delete notification: Vault opened with 6 Markdown files.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Clear resolved" }));

    expect(onDelete).toHaveBeenCalledWith("event-1");
    expect(onClearResolved).toHaveBeenCalledOnce();
  });

  it("keeps an unresolved conflict actionable until marked resolved", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(
      <NotificationCenter
        entries={[
          entry({
            kind: "conflict",
            message: "Leadership.md changed outside Anchored.",
            requiresAction: true,
          }),
        ]}
        onClearResolved={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResolve={onResolve}
      />,
    );

    expect(screen.getByText("Needs attention")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Delete notification/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Mark notification resolved: Leadership.md changed outside Anchored.",
      }),
    );
    expect(onResolve).toHaveBeenCalledWith("event-1");
  });

  it("shows a clear empty state", () => {
    render(
      <NotificationCenter
        entries={[]}
        onClearResolved={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getByText("No notifications yet.")).toBeVisible();
  });
});
