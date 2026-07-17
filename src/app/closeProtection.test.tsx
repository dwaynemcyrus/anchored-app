import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCloseProtection } from "./closeProtection";

const nativeWindow = vi.hoisted(() => ({
  close: vi.fn(),
  closeHandler: undefined as
    ((event: { preventDefault: () => void }) => void) | undefined,
  onCloseRequested: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: nativeWindow.close,
    onCloseRequested: nativeWindow.onCloseRequested,
  }),
}));

function Harness() {
  const [blocked, setBlocked] = useState(false);
  const discardAndClose = useCloseProtection({
    hasUnfinishedEdits: true,
    onCloseBlocked: () => setBlocked(true),
    onError: vi.fn(),
  });

  return blocked ? (
    <button type="button" onClick={() => void discardAndClose()}>
      Discard
    </button>
  ) : null;
}

describe("useCloseProtection", () => {
  beforeEach(() => {
    nativeWindow.close.mockReset();
    nativeWindow.unlisten.mockReset();
    nativeWindow.closeHandler = undefined;
    nativeWindow.onCloseRequested.mockReset();
    nativeWindow.onCloseRequested.mockImplementation(async (handler) => {
      nativeWindow.closeHandler = handler;
      return nativeWindow.unlisten;
    });
  });

  it("blocks native close until discard is explicit", async () => {
    const user = userEvent.setup();
    const preventDefault = vi.fn();
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());

    nativeWindow.closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(nativeWindow.close).toHaveBeenCalledOnce();

    unmount();
    expect(nativeWindow.unlisten).toHaveBeenCalledOnce();
  });
});
