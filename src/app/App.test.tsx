import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVaultFile,
  readVaultFile,
  rescanVault,
  saveVaultFile,
  selectVault,
} from "../lib/tauri/vault";
import { App } from "./App";

vi.mock("../lib/tauri/vault", () => ({
  createVaultFile: vi.fn(),
  readVaultFile: vi.fn(),
  rescanVault: vi.fn(),
  saveVaultFile: vi.fn(),
  selectVault: vi.fn(),
}));

const mockedSelectVault = vi.mocked(selectVault);
const mockedCreateVaultFile = vi.mocked(createVaultFile);
const mockedReadVaultFile = vi.mocked(readVaultFile);
const mockedRescanVault = vi.mocked(rescanVault);
const mockedSaveVaultFile = vi.mocked(saveVaultFile);
const noWarnings = {
  addedIdentities: 0,
  identityConflicts: 0,
  needsIdentity: 0,
  skippedNonUtf8Paths: 0,
  skippedSymlinks: 0,
};

describe("App", () => {
  beforeEach(() => {
    mockedCreateVaultFile.mockReset();
    mockedSelectVault.mockReset();
    mockedReadVaultFile.mockReset();
    mockedRescanVault.mockReset();
    mockedSaveVaultFile.mockReset();
  });

  it("renders the seeded editor surface", () => {
    render(<App />);

    expect(screen.getByText("Anchored")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Leadership" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Leadership.md" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("filters notes by filename or alias", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search notes" }),
      "Leading Well",
    );

    expect(
      screen.getByRole("button", { name: "Leadership.md" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reading Notes.md" }),
    ).not.toBeInTheDocument();
  });

  it("creates a local unsaved note", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);

    const editor = await screen.findByRole("textbox", {
      name: "Untitled.md Markdown editor",
    });
    expect(editor).toHaveAttribute("aria-placeholder", "Start writing…");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    await user.click(editor);
    await user.keyboard("# Draft");
    await user.click(screen.getByRole("button", { name: "Leadership.md" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Untitled.md" }));

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(
      await screen.findByRole("textbox", {
        name: "Untitled.md Markdown editor",
      }),
    ).toHaveTextContent("# Draft");
  });

  it("creates a real vault note through Save As", async () => {
    const user = userEvent.setup();
    const identifiedContent =
      "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n\n# Created";
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedCreateVaultFile.mockResolvedValue({
      content: identifiedContent,
      relativePath: "Writing/Created.md",
      sizeBytes: identifiedContent.length,
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );
    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
    const editor = await screen.findByRole("textbox", {
      name: "Untitled.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard("# Created");
    await user.click(
      screen.getByRole("button", { name: "Save Untitled.md as" }),
    );

    expect(mockedCreateVaultFile).toHaveBeenCalledWith({
      content: "# Created",
      suggestedName: "Untitled.md",
    });
    expect(
      await screen.findByRole("textbox", {
        name: "Created.md Markdown editor",
      }),
    ).toHaveTextContent("---id: 01JZQ7K8P4A6F2M9V3C5T7X1BY---# Created");
    expect(screen.getByRole("button", { name: "Created.md" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("opens exact Markdown from a safely scanned vault and closes it", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Own Note.md",
          parent: "Knowledge",
          relativePath: "Knowledge/Own Note.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "---\ntitle: Own note\n---\n# Exact Markdown\n",
      relativePath: "Knowledge/Own Note.md",
      sizeBytes: 45,
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "No note open" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Leadership.md" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 Markdown files found.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Own Note.md" }));

    expect(mockedReadVaultFile).toHaveBeenCalledWith("Knowledge/Own Note.md");
    expect(
      await screen.findByRole("textbox", {
        name: "Own Note.md Markdown editor",
      }),
    ).toHaveTextContent("---title: Own note---# Exact Markdown");

    screen.getByRole("button", { name: "Close Own Note.md" }).focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("heading", { level: 1, name: "No note open" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Own Note.md" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("rescans for Finder-added notes when the app regains focus", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedRescanVault.mockResolvedValue({
      files: [
        {
          name: "Finder Note.md",
          parent: "Notes",
          relativePath: "Notes/Finder Note.md",
        },
      ],
      name: "My Vault",
      warnings: { ...noWarnings, addedIdentities: 1 },
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );
    window.dispatchEvent(new Event("focus"));

    expect(
      await screen.findByRole("button", { name: "Finder Note.md" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 new note identities added/)).toBeInTheDocument();
  });

  it("shows a recoverable error when a vault note cannot be read", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Broken.md",
          parent: "Notes",
          relativePath: "Notes/Broken.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile
      .mockRejectedValueOnce({
        message: "This Markdown file is not valid UTF-8.",
      })
      .mockResolvedValueOnce({
        content: "# Recovered\n",
        relativePath: "Notes/Broken.md",
        sizeBytes: 12,
      });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );
    await user.click(screen.getByRole("button", { name: "Broken.md" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This Markdown file is not valid UTF-8.",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("textbox", {
        name: "Broken.md Markdown editor",
      }),
    ).toHaveTextContent("# Recovered");
    expect(mockedReadVaultFile).toHaveBeenCalledTimes(2);
  });

  it("opens an empty Markdown file at the vault root", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Empty.md",
          parent: "",
          relativePath: "Empty.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "",
      relativePath: "Empty.md",
      sizeBytes: 0,
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );
    await user.click(screen.getByRole("button", { name: "Empty.md" }));

    expect(mockedReadVaultFile).toHaveBeenCalledWith("Empty.md");
    expect(
      await screen.findByRole("textbox", { name: "Empty.md Markdown editor" }),
    ).toHaveAttribute("aria-placeholder", "Start writing…");
  });

  it("saves an edited vault note with Command-S", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Editable.md",
          parent: "Notes",
          relativePath: "Notes/Editable.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Before\n",
      relativePath: "Notes/Editable.md",
      sizeBytes: 9,
    });
    mockedSaveVaultFile.mockResolvedValue({
      content: " updated# Before\n",
      relativePath: "Notes/Editable.md",
      sizeBytes: 17,
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );
    await user.click(screen.getByRole("button", { name: "Editable.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Editable.md Markdown editor",
    });

    await user.click(editor);
    await user.keyboard(" updated");
    await user.keyboard("{Meta>}s{/Meta}");

    expect(mockedSaveVaultFile).toHaveBeenCalledWith({
      content: " updated# Before\n",
      expectedContent: "# Before\n",
      relativePath: "Notes/Editable.md",
    });
    expect(mockedSaveVaultFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("preserves local edits and shows a conflict when the file changed outside Anchored", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Conflict.md",
          parent: "Notes",
          relativePath: "Notes/Conflict.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Before\n",
      relativePath: "Notes/Conflict.md",
      sizeBytes: 9,
    });
    mockedSaveVaultFile.mockRejectedValue({
      code: "vaultConflict",
      message: "The file changed outside Anchored. Your edits were kept.",
    });
    mockedCreateVaultFile.mockResolvedValue({
      content: " updated# Before\n",
      relativePath: "Notes/Recovered.md",
      sizeBytes: 17,
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );
    await user.click(screen.getByRole("button", { name: "Conflict.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Conflict.md Markdown editor",
    });

    await user.click(editor);
    await user.keyboard(" updated");
    await user.keyboard("{Meta>}s{/Meta}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file changed outside Anchored. Your edits were kept.",
    );
    expect(screen.getByText("Conflict")).toBeInTheDocument();
    expect(editor.textContent).toBe(" updated# Before");

    await user.click(
      screen.getByRole("button", { name: "Save Conflict.md as" }),
    );

    expect(mockedCreateVaultFile).toHaveBeenCalledWith({
      content: " updated# Before\n",
      suggestedName: "Conflict.md",
    });
    expect(
      (
        await screen.findByRole("textbox", {
          name: "Recovered.md Markdown editor",
        })
      ).textContent,
    ).toBe(" updated# Before");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
