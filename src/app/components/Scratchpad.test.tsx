import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createScratchpadNote,
  latestScratchpadNote,
  listScratchpadNotes,
  loadScratchpadLinkCandidates,
  saveScratchpadNote,
  readScratchpadNote,
} from "../../lib/tauri/scratchpad";
import { Scratchpad } from "./Scratchpad";

const hide = vi.fn();
let closeHandler: (() => void) | undefined;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide,
    onCloseRequested: vi.fn().mockImplementation((handler) => {
      closeHandler = () =>
        handler({
          preventDefault: vi.fn(),
        });
      return Promise.resolve(vi.fn());
    }),
  }),
}));

vi.mock("../../lib/tauri/scratchpad", () => ({
  createScratchpadNote: vi.fn(),
  latestScratchpadNote: vi.fn(),
  listScratchpadNotes: vi.fn(),
  loadScratchpadLinkCandidates: vi.fn(),
  saveScratchpadNote: vi.fn(),
  readScratchpadNote: vi.fn(),
}));

const mockedCreate = vi.mocked(createScratchpadNote);
const mockedLatest = vi.mocked(latestScratchpadNote);
const mockedList = vi.mocked(listScratchpadNotes);
const mockedLoadCandidates = vi.mocked(loadScratchpadLinkCandidates);
const mockedSave = vi.mocked(saveScratchpadNote);
const mockedRead = vi.mocked(readScratchpadNote);

describe("Scratchpad", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?scratchpad=1&mode=new");
    closeHandler = undefined;
    hide.mockReset();
    mockedCreate.mockReset();
    mockedLatest.mockReset();
    mockedList.mockReset();
    mockedLoadCandidates.mockReset();
    mockedSave.mockReset();
    mockedRead.mockReset();
    mockedList.mockResolvedValue([]);
    mockedLoadCandidates.mockResolvedValue([
      { label: "Linked note", target: "Notes/Linked note" },
    ]);
    mockedCreate.mockImplementation(async (body) => ({
      body,
      persistedContent: `---\ntype: scratchpad\nstatus: inbox\n---\n${body}`,
      relativePath: "Scratchpad 2026-11-28 164832.md",
    }));
    mockedSave.mockImplementation(async ({ body, relativePath }) => ({
      body,
      persistedContent: `---\ntype: scratchpad\nstatus: inbox\n---\n${body}`,
      relativePath,
    }));
  });

  it("creates on first input and inserts a bounded wikilink suggestion", async () => {
    const user = userEvent.setup();
    render(<Scratchpad />);
    const textarea = screen.getByRole("textbox", {
      name: "Scratchpad Markdown",
    });

    await user.type(textarea, "Zürich");
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith("Zürich"), {
      timeout: 1_500,
    });

    await waitFor(() => expect(mockedLoadCandidates).toHaveBeenCalledOnce());
    fireEvent.change(textarea, { target: { value: "See [[link" } });
    await user.click(
      await screen.findByRole("option", { name: /Linked note/ }),
    );

    expect(textarea).toHaveValue("See [[Notes/Linked note]]");
  });

  it("does not persist a blank capture when the window hides", async () => {
    render(<Scratchpad />);

    await waitFor(() => expect(closeHandler).toBeTypeOf("function"));
    closeHandler?.();

    await waitFor(() => expect(hide).toHaveBeenCalledOnce());
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("keeps the draft visible when a save conflict prevents hiding", async () => {
    mockedCreate.mockRejectedValue(
      new Error("This note changed outside Anchored."),
    );
    render(<Scratchpad />);
    const textarea = screen.getByRole("textbox", {
      name: "Scratchpad Markdown",
    });

    fireEvent.change(textarea, { target: { value: "Keep this draft" } });
    expect(
      await screen.findByText("This note changed outside Anchored."),
    ).toBeVisible();
    closeHandler?.();
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));

    expect(hide).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Keep this draft");
  });

  it("opens the newest non-archived capture in previous mode", async () => {
    window.history.replaceState({}, "", "/?scratchpad=1&mode=previous");
    mockedLatest.mockResolvedValue({
      body: "Previous capture",
      persistedContent:
        "---\ntype: scratchpad\nstatus: inbox\n---\nPrevious capture",
      relativePath: "Scratchpad previous.md",
    });

    render(<Scratchpad />);

    expect(await screen.findByDisplayValue("Previous capture")).toBeVisible();
    expect(mockedLatest).toHaveBeenCalledOnce();
  });

  it("uses Control-Option shortcuts and displays matching key hints", async () => {
    mockedLatest.mockResolvedValue(null);
    render(<Scratchpad />);
    const textarea = screen.getByRole("textbox", {
      name: "Scratchpad Markdown",
    });

    expect(screen.getByText("⌃⌥N New")).toBeVisible();
    expect(screen.getByText("⌃⌥P Previous")).toBeVisible();
    expect(screen.getByText("⌃⌥S Notes")).toBeVisible();
    fireEvent.keyDown(textarea, { altKey: true, key: "p", metaKey: true });
    expect(mockedLatest).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { altKey: true, ctrlKey: true, key: "p" });

    await waitFor(() => expect(mockedLatest).toHaveBeenCalledOnce());
  });

  it("lists active captures and opens one in the same lightweight window", async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([
      {
        modifiedMillis: Date.UTC(2026, 6, 19, 10),
        name: "Scratchpad listed.md",
        relativePath: "Scratchpad listed.md",
      },
    ]);
    mockedRead.mockResolvedValue({
      body: "Listed capture",
      persistedContent:
        "---\ntype: scratchpad\nstatus: inbox\n---\nListed capture",
      relativePath: "Scratchpad listed.md",
    });
    render(<Scratchpad />);

    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Scratchpad Markdown" }),
      {
        altKey: true,
        ctrlKey: true,
        key: "s",
      },
    );
    await user.click(
      await screen.findByRole("button", { name: /Scratchpad listed/ }),
    );

    expect(mockedRead).toHaveBeenCalledWith("Scratchpad listed.md");
    expect(
      screen.getByRole("textbox", { name: "Scratchpad Markdown" }),
    ).toHaveValue("Listed capture");
  });

  it("waits for composition to finish before autosaving", async () => {
    render(<Scratchpad />);
    const textarea = screen.getByRole("textbox", {
      name: "Scratchpad Markdown",
    });

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: "あ" } });
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(mockedCreate).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea, { data: "あ" });
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith("あ"), {
      timeout: 1_500,
    });
  });
});
