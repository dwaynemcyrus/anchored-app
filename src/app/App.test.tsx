import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readVaultFile, selectVault } from "../lib/tauri/vault";
import { App } from "./App";

vi.mock("../lib/tauri/vault", () => ({
  readVaultFile: vi.fn(),
  selectVault: vi.fn(),
}));

const mockedSelectVault = vi.mocked(selectVault);
const mockedReadVaultFile = vi.mocked(readVaultFile);

describe("App", () => {
  beforeEach(() => {
    mockedSelectVault.mockReset();
    mockedReadVaultFile.mockReset();
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

    expect(
      screen.getByRole("heading", { level: 1, name: "Untitled" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved");
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
      warnings: { skippedNonUtf8Paths: 0, skippedSymlinks: 0 },
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
        name: "Own Note.md Markdown document",
      }),
    ).toHaveTextContent("--- title: Own note --- # Exact Markdown");

    screen.getByRole("button", { name: "Close Own Note.md" }).focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("heading", { level: 1, name: "No note open" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Own Note.md" }),
    ).not.toHaveAttribute("aria-current");
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
      warnings: { skippedNonUtf8Paths: 0, skippedSymlinks: 0 },
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

    expect(await screen.findByText("# Recovered")).toBeInTheDocument();
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
      warnings: { skippedNonUtf8Paths: 0, skippedSymlinks: 0 },
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
      await screen.findByText("This Markdown file is empty."),
    ).toBeInTheDocument();
  });
});
