import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TrashPanel } from "./TrashPanel";

const entry = {
  id: "01JZQC4G61A6F2M9V3C5T7X1CA",
  name: "Leadership.md",
  originalPath: "Notes/Leadership.md",
  trashedAt: Date.UTC(2026, 6, 17, 9),
};

describe("TrashPanel", () => {
  it("restores an entry and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRestore = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <TrashPanel
        entries={[entry]}
        loading={false}
        onClose={onClose}
        onRestore={onRestore}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "Trash" });
    expect(
      within(panel).getByRole("button", { name: "Close Trash" }),
    ).toHaveFocus();
    expect(within(panel).getByText(entry.originalPath)).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledWith(entry);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("shows empty, loading, and recoverable error states", () => {
    const { rerender } = render(
      <TrashPanel entries={[]} loading onClose={vi.fn()} onRestore={vi.fn()} />,
    );
    expect(screen.getByText("Loading Trash…")).toBeVisible();

    rerender(
      <TrashPanel
        entries={[]}
        loading={false}
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText("Trash is empty.")).toBeVisible();

    rerender(
      <TrashPanel
        entries={[]}
        error="The original path is occupied."
        loading={false}
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The original path is occupied.",
    );
  });
});
