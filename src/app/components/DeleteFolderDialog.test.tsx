import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeleteFolderDialog } from "./DeleteFolderDialog";

describe("DeleteFolderDialog", () => {
  it("requires the exact confirmation phrase for non-empty folders", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <DeleteFolderDialog
        deleting={false}
        fileCount={3}
        folderCount={2}
        folderName="Projects"
        onClose={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const input = screen.getByRole("textbox", {
      name: "Delete folder confirmation",
    });
    const deleteButton = screen.getByRole("button", {
      name: "Move folder to Trash",
    });
    expect(deleteButton).toBeDisabled();

    await user.type(input, "delete folders");
    expect(deleteButton).toBeDisabled();
    await user.clear(input);
    await user.type(input, "delete folder");
    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith("delete folder");
  });
});
