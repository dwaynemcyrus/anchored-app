import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VaultSwitcher } from "./VaultSwitcher";

const current = {
  available: true,
  id: "019f989c-2dc0-7b01-8a11-1c2d3e4f5061",
  lastOpenedAt: Date.UTC(2026, 6, 17, 9),
  name: "Current Vault",
};
const unavailable = {
  available: false,
  id: "019f989c-2dc0-7b02-9a22-2c3d4e5f6072",
  lastOpenedAt: Date.UTC(2026, 6, 16, 9),
  name: "Moved Vault",
};

describe("VaultSwitcher", () => {
  it("distinguishes current and unavailable vaults and supports Forget", async () => {
    const user = userEvent.setup();
    const onForget = vi.fn();
    render(
      <VaultSwitcher
        currentVaultId={current.id}
        loading={false}
        vaults={[current, unavailable]}
        onClose={vi.fn()}
        onCreateVault={vi.fn()}
        onForget={onForget}
        onOpenAnother={vi.fn()}
        onOpenRemembered={vi.fn()}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "Switch vault" });
    expect(within(panel).getByText("Open now")).toBeVisible();
    expect(within(panel).getByText("Folder unavailable")).toBeVisible();
    const openButtons = within(panel).getAllByRole("button", { name: "Open" });
    expect(openButtons).toHaveLength(1);
    expect(openButtons[0]).toBeDisabled();
    const forgetButtons = within(panel).getAllByRole("button", {
      name: "Forget",
    });
    await user.click(forgetButtons[1]);
    expect(onForget).toHaveBeenCalledWith(unavailable.id);
  });

  it("opens another vault and restores focus after Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenAnother = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <VaultSwitcher
        currentVaultId=""
        loading={false}
        vaults={[]}
        onClose={onClose}
        onCreateVault={vi.fn()}
        onForget={vi.fn()}
        onOpenAnother={onOpenAnother}
        onOpenRemembered={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Close vault switcher" }),
    ).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: "Open another vault…" }),
    );
    expect(onOpenAnother).toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
