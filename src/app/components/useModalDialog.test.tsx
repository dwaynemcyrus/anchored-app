import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useModalDialog } from "./useModalDialog";

function TestDialog({ onClose }: { onClose: () => void }) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const { dialogRef, onDialogKeyDown } = useModalDialog<HTMLDivElement>({
    initialFocusRef: firstRef,
    onClose,
  });

  return (
    <div
      ref={dialogRef}
      aria-label="Test dialog"
      aria-modal="true"
      role="dialog"
      tabIndex={-1}
      onKeyDown={onDialogKeyDown}
    >
      <button ref={firstRef} type="button">
        First
      </button>
      <button type="button">Last</button>
    </div>
  );
}

describe("useModalDialog", () => {
  it("contains focus, closes with Escape, and restores prior focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<TestDialog onClose={onClose} />);

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
