import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CreateMissingWikilinkDialog } from "./CreateMissingWikilinkDialog";

describe("CreateMissingWikilinkDialog", () => {
  it("explains Inbox creation and supports keyboard dismissal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreate = vi.fn();

    render(
      <CreateMissingWikilinkDialog
        creating={false}
        target="Future idea"
        onClose={onClose}
        onCreate={onCreate}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Create missing note" });
    expect(dialog).toHaveTextContent("[[Future idea]]");
    expect(dialog).toHaveTextContent("physical Inbox folder");
    expect(
      screen.getByRole("button", {
        name: "Close create missing note dialog",
      }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Create note" }));
    expect(onCreate).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows creation errors and disables actions while creating", () => {
    render(
      <CreateMissingWikilinkDialog
        creating
        error="The note already exists."
        target="Future idea"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The note already exists.",
    );
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
