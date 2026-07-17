import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuitConfirmation } from "./QuitConfirmation";

describe("QuitConfirmation", () => {
  it("requires an explicit safe or destructive choice", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    render(
      <QuitConfirmation
        unfinishedCount={2}
        onCancel={onCancel}
        onDiscard={onDiscard}
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: "Unsaved notes" }),
    ).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText(/2 notes have changes/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Keep Anchored Open" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Quit Without Saving" }),
    );
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
