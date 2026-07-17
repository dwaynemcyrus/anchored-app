import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyIdentityMigration,
  createVaultFile,
  forgetVault,
  listRememberedVaults,
  listVaultTrash,
  moveVaultFileToTrash,
  openRememberedVault,
  previewIdentityMigration,
  readVaultFile,
  renameVaultFile,
  rescanVault,
  saveVaultFile,
  searchVault,
  selectVault,
  restoreVaultFileFromTrash,
} from "../lib/tauri/vault";
import { App } from "./App";

vi.mock("../lib/tauri/vault", () => ({
  applyIdentityMigration: vi.fn(),
  createVaultFile: vi.fn(),
  forgetVault: vi.fn(),
  listRememberedVaults: vi.fn(),
  listVaultTrash: vi.fn(),
  moveVaultFileToTrash: vi.fn(),
  openRememberedVault: vi.fn(),
  previewIdentityMigration: vi.fn(),
  readVaultFile: vi.fn(),
  renameVaultFile: vi.fn(),
  rescanVault: vi.fn(),
  saveVaultFile: vi.fn(),
  searchVault: vi.fn(),
  selectVault: vi.fn(),
  restoreVaultFileFromTrash: vi.fn(),
}));

const mockedSelectVault = vi.mocked(selectVault);
const mockedApplyIdentityMigration = vi.mocked(applyIdentityMigration);
const mockedCreateVaultFile = vi.mocked(createVaultFile);
const mockedForgetVault = vi.mocked(forgetVault);
const mockedListRememberedVaults = vi.mocked(listRememberedVaults);
const mockedListVaultTrash = vi.mocked(listVaultTrash);
const mockedMoveVaultFileToTrash = vi.mocked(moveVaultFileToTrash);
const mockedOpenRememberedVault = vi.mocked(openRememberedVault);
const mockedPreviewIdentityMigration = vi.mocked(previewIdentityMigration);
const mockedReadVaultFile = vi.mocked(readVaultFile);
const mockedRenameVaultFile = vi.mocked(renameVaultFile);
const mockedRescanVault = vi.mocked(rescanVault);
const mockedSaveVaultFile = vi.mocked(saveVaultFile);
const mockedSearchVault = vi.mocked(searchVault);
const mockedRestoreVaultFileFromTrash = vi.mocked(restoreVaultFileFromTrash);
const noWarnings = {
  addedIdentities: 0,
  identityConflicts: 0,
  needsIdentity: 0,
  skippedNonUtf8Paths: 0,
  skippedSymlinks: 0,
};

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedApplyIdentityMigration.mockReset();
    mockedCreateVaultFile.mockReset();
    mockedForgetVault.mockReset();
    mockedListRememberedVaults.mockReset();
    mockedListVaultTrash.mockReset();
    mockedMoveVaultFileToTrash.mockReset();
    mockedOpenRememberedVault.mockReset();
    mockedPreviewIdentityMigration.mockReset();
    mockedSelectVault.mockReset();
    mockedReadVaultFile.mockReset();
    mockedRenameVaultFile.mockReset();
    mockedRescanVault.mockReset();
    mockedSaveVaultFile.mockReset();
    mockedSearchVault.mockReset();
    mockedRestoreVaultFileFromTrash.mockReset();
    mockedListRememberedVaults.mockResolvedValue([]);
    mockedListVaultTrash.mockResolvedValue([]);
  });

  it("starts with an explicit no-vault state", () => {
    render(<App />);

    expect(screen.getByText("Anchored")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "No vault open" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open vault" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "Open a vault before creating a note",
      }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", {
        name: "Open a vault before creating a note",
      })[0],
    ).toBeDisabled();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("renders when local activity storage is unavailable", () => {
    const storageSpy = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Storage is unavailable", "SecurityError");
      });

    try {
      render(<App />);
      expect(screen.getByText("Anchored")).toBeInTheDocument();
    } finally {
      storageSpy.mockRestore();
    }
  });

  it("keeps a timestamped vault event in dismissible notification history", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      screen.getByRole("button", { name: "Open notification history (1)" }),
    );

    const history = screen.getByRole("dialog", {
      name: "Notification history",
    });
    expect(within(history).getByText("0 Markdown files found.")).toBeVisible();
    expect(within(history).getByText("Vault")).toBeVisible();
    expect(within(history).getByRole("time")).toHaveAttribute("dateTime");

    await user.click(
      within(history).getByRole("button", {
        name: "Delete notification: 0 Markdown files found.",
      }),
    );
    expect(within(history).getByText("No notifications yet.")).toBeVisible();
  });

  it("opens and forgets a remembered vault from the switcher", async () => {
    const user = userEvent.setup();
    const rememberedVault = {
      available: true,
      id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      lastOpenedAt: Date.UTC(2026, 6, 17, 8),
      name: "Second Vault",
    };
    mockedListRememberedVaults.mockResolvedValue([rememberedVault]);
    mockedOpenRememberedVault.mockResolvedValue({
      files: [],
      name: rememberedVault.name,
      vaultId: rememberedVault.id,
      warnings: noWarnings,
    });
    mockedForgetVault.mockResolvedValue([]);
    render(<App />);

    await waitFor(() => expect(mockedListRememberedVaults).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Open vault" }));
    const switcher = screen.getByRole("dialog", { name: "Switch vault" });
    expect(within(switcher).getByText("Second Vault")).toBeVisible();
    await user.click(within(switcher).getByRole("button", { name: "Open" }));

    expect(mockedOpenRememberedVault).toHaveBeenCalledWith(rememberedVault.id);
    expect(
      await screen.findByRole("button", {
        name: "Switch vault: Second Vault",
      }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Switch vault: Second Vault" }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Switch vault" })).getByRole(
        "button",
        { name: "Forget" },
      ),
    );
    expect(mockedForgetVault).toHaveBeenCalledWith(rememberedVault.id);
  });

  it("moves a saved note to the vault Trash", async () => {
    const user = userEvent.setup();
    const vaultId = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
    const file = {
      id: "01JZQ91T3AA6F2M9V3C5T7X1BZ",
      name: "Leadership.md",
      parent: "Notes",
      relativePath: "Notes/Leadership.md",
    };
    const trashEntry = {
      id: "01JZQC4G61A6F2M9V3C5T7X1CA",
      name: file.name,
      originalPath: file.relativePath,
      trashedAt: Date.UTC(2026, 6, 17, 9),
    };
    mockedSelectVault.mockResolvedValue({
      files: [file],
      name: "My Vault",
      vaultId,
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Leadership",
      relativePath: file.relativePath,
      sizeBytes: 12,
    });
    mockedMoveVaultFileToTrash.mockResolvedValue({
      entry: trashEntry,
      snapshot: {
        files: [],
        name: "My Vault",
        vaultId,
        warnings: noWarnings,
      },
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: file.name }));
    await user.click(
      await screen.findByRole("button", {
        name: `Move ${file.name} to Trash`,
      }),
    );

    expect(mockedMoveVaultFileToTrash).toHaveBeenCalledWith(file.relativePath);
    expect(screen.getByText(`${file.name} moved to Trash.`)).toBeVisible();
    expect(screen.queryByRole("button", { name: file.name })).toBeNull();
    expect(screen.getByRole("button", { name: "Trash (1)" })).toBeVisible();
  });

  it("restores a trashed note to its original path", async () => {
    const user = userEvent.setup();
    const vaultId = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
    const trashEntry = {
      id: "01JZQC4G61A6F2M9V3C5T7X1CA",
      name: "Leadership.md",
      originalPath: "Notes/Leadership.md",
      trashedAt: Date.UTC(2026, 6, 17, 9),
    };
    const restoredFile = {
      id: "01JZQ91T3AA6F2M9V3C5T7X1BZ",
      name: trashEntry.name,
      parent: "Notes",
      relativePath: trashEntry.originalPath,
    };
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      vaultId,
      warnings: noWarnings,
    });
    mockedListVaultTrash.mockResolvedValue([trashEntry]);
    mockedRestoreVaultFileFromTrash.mockResolvedValue({
      entry: trashEntry,
      snapshot: {
        files: [restoredFile],
        name: "My Vault",
        vaultId,
        warnings: noWarnings,
      },
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(await screen.findByRole("button", { name: "Trash (1)" }));
    const trash = screen.getByRole("dialog", { name: "Trash" });
    await user.click(within(trash).getByRole("button", { name: "Restore" }));

    expect(mockedRestoreVaultFileFromTrash).toHaveBeenCalledWith(trashEntry.id);
    expect(
      screen.getByText(
        `${trashEntry.name} restored to ${trashEntry.originalPath}.`,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: restoredFile.name }),
    ).toBeVisible();
  });

  it("filters notes by filename or alias", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          aliases: ["Leading Well"],
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
        {
          name: "Reading Notes.md",
          parent: "Notes",
          relativePath: "Notes/Reading Notes.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));

    await user.type(
      screen.getByRole("searchbox", { name: "Filter notes" }),
      "Leading Well",
    );

    expect(
      screen.getByRole("button", { name: "Leadership.md" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reading Notes.md" }),
    ).not.toBeInTheDocument();
  });

  it("searches Markdown content and opens a result", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedSearchVault.mockResolvedValue({
      matches: [
        {
          line: 8,
          relativePath: "Notes/Leadership.md",
          snippet: "A calm system supports daily writing.",
        },
      ],
      searchedFiles: 1,
      skippedFiles: 0,
      truncated: false,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "A calm system supports daily writing.",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 37,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.keyboard("{Meta>}{Shift>}f{/Shift}{/Meta}");
    const dialog = screen.getByRole("dialog", { name: "Search vault" });
    await user.type(
      within(dialog).getByRole("combobox", {
        name: "Search Markdown content",
      }),
      "calm",
    );

    const result = await within(dialog).findByRole("option");
    expect(mockedSearchVault).toHaveBeenCalledWith("calm");
    expect(result).toHaveTextContent("Leadership.md");
    expect(result).toHaveTextContent("Line 8");
    expect(result).toHaveTextContent("A calm system");
    await user.keyboard("{Enter}");

    expect(
      screen.queryByRole("dialog", { name: "Search vault" }),
    ).not.toBeInTheDocument();
    expect(mockedReadVaultFile).toHaveBeenCalledWith("Notes/Leadership.md");
  });

  it("explains when content search needs an open vault", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Search vault" }));

    expect(
      screen.getByText("Open a vault to search its Markdown notes."),
    ).toBeInTheDocument();
    expect(mockedSearchVault).not.toHaveBeenCalled();
  });

  it("keeps vault search usable after a native search error", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedSearchVault.mockRejectedValue({
      message: "One folder could not be searched.",
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Search vault" }));
    await user.type(
      screen.getByRole("combobox", { name: "Search Markdown content" }),
      "missing",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "One folder could not be searched.",
    );
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Search vault" }),
    ).not.toBeInTheDocument();
  });

  it("quick-opens notes by filename or alias with the keyboard", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          aliases: ["Leading Well"],
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
        {
          id: "01JZQ91T3AA6F2M9V3C5T7X1BZ",
          name: "Reading.md",
          parent: "Writing",
          relativePath: "Writing/Reading.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Leadership",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 12,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.keyboard("{Meta>}p{/Meta}");

    const dialog = screen.getByRole("dialog", { name: "Quick Open" });
    const input = within(dialog).getByRole("combobox", {
      name: "Find a note",
    });
    expect(input).toHaveFocus();
    expect(
      within(dialog).getByRole("listbox", { name: "Notes" }),
    ).toHaveTextContent("Leadership");

    await user.type(input, "Leading");
    expect(within(dialog).getByRole("option")).toHaveTextContent(
      "Alias: Leading Well",
    );
    await user.keyboard("{Enter}");

    expect(
      screen.queryByRole("dialog", { name: "Quick Open" }),
    ).not.toBeInTheDocument();
    expect(mockedReadVaultFile).toHaveBeenCalledWith("Notes/Leadership.md");
    expect(
      await screen.findByRole("textbox", {
        name: "Leadership.md Markdown editor",
      }),
    ).toHaveTextContent("# Leadership");
  });

  it("shows resolved backlinks and opens their source note", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          outgoingLinks: ["Reading Notes"],
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
        {
          name: "Reading Notes.md",
          parent: "Notes",
          relativePath: "Notes/Reading Notes.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockImplementation(async (relativePath) => ({
      content: `# ${relativePath.includes("Leadership") ? "Leadership" : "Reading Notes"}`,
      relativePath,
      sizeBytes: 16,
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Reading Notes.md" }));
    const backlinks = screen.getByRole("complementary", {
      name: "Backlinks (1)",
    });
    const backlink = within(backlinks).getByRole("button", {
      name: "Notes/Leadership.md",
    });
    backlink.focus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("textbox", {
        name: "Leadership.md Markdown editor",
      }),
    ).toHaveTextContent("# Leadership");
  });

  it("creates a local unsaved note", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);

    const editor = await screen.findByRole("textbox", {
      name: "Untitled.md Markdown editor",
    });
    expect(editor).toHaveAttribute("aria-placeholder", "Start writing…");
    expect(screen.getByText("Unsaved")).toBeInTheDocument();

    await user.click(editor);
    await user.keyboard("# Draft");
    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
    expect(
      await screen.findByRole("textbox", {
        name: "Untitled 2.md Markdown editor",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Untitled.md" }));

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(
      await screen.findByRole("textbox", {
        name: "Untitled.md Markdown editor",
      }),
    ).toHaveTextContent("# Draft");
  });

  it("finds text within the active Markdown note with Command-F", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
    const editor = await screen.findByRole("textbox", {
      name: "Untitled.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard("Daily writing and reliable links");
    await user.click(screen.getByText("Anchored"));
    await user.keyboard("{Meta>}f{/Meta}");

    const find = screen.getByRole("textbox", { name: "Find" });
    expect(find).toHaveFocus();
    await user.type(find, "reliable");
    expect(find).toHaveValue("reliable");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("textbox", { name: "Find" }),
    ).not.toBeInTheDocument();
  });

  it("completes compact filename, alias, and unresolved wikilinks", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "Source.md",
          parent: "Notes",
          relativePath: "Notes/Source.md",
        },
        {
          aliases: ["Leading Well"],
          id: "01JZQ91T3AA6F2M9V3C5T7X1BZ",
          name: "Leadership.md",
          outgoingLinks: ["Future Idea"],
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "",
      relativePath: "Notes/Source.md",
      sizeBytes: 0,
    });
    mockedSaveVaultFile.mockImplementation(async (request) => ({
      content: request.content,
      relativePath: request.relativePath,
      sizeBytes: request.content.length,
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Source.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Source.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard("[[[[");

    const completions = await screen.findByRole("listbox", {
      name: "Completions",
    });
    expect(
      within(completions).getByText("Leadership", {
        selector: ".cm-completionLabel",
      }),
    ).toBeInTheDocument();
    await user.keyboard("Lea");
    await within(
      await screen.findByRole("listbox", { name: "Completions" }),
    ).findByText("New uncreated link");
    await user.keyboard("{Enter}");
    expect(editor).toHaveTextContent("[[Leadership]]");

    await user.keyboard(" [[[[Future");
    expect(
      await screen.findByRole("listbox", { name: "Completions" }),
    ).toHaveTextContent("Future IdeaUncreated · 1 reference");
    await user.keyboard("{Enter}");
    expect(editor).toHaveTextContent("[[Leadership]] [[Future Idea]]");

    await user.keyboard(" [[[[Leading W");
    expect(
      await screen.findByRole("listbox", { name: "Completions" }),
    ).toHaveTextContent("Leading WellAlias · Notes");
    await user.click(
      screen.getByText("Leading Well", { selector: ".cm-completionLabel" }),
    );
    expect(editor).toHaveFocus();
    expect(editor).toHaveTextContent(
      "[[Leadership]] [[Future Idea]] [[Leadership|Leading Well]]",
    );
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

    await user.click(screen.getByRole("button", { name: "Open vault" }));
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

    await user.click(screen.getByRole("button", { name: "Open vault" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "No note open" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Leadership.md" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 Markdown files found.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Dismiss notification: 1 Markdown files found.",
      }),
    );
    expect(
      screen.queryByText("1 Markdown files found."),
    ).not.toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    window.dispatchEvent(new Event("focus"));

    expect(
      await screen.findByRole("button", { name: "Finder Note.md" }),
    ).toBeInTheDocument();
    const notifications = screen.getByLabelText("Notifications");
    expect(
      within(notifications).getByText("0 Markdown files found."),
    ).toBeInTheDocument();
    expect(
      within(notifications).getByText(/1 new note identities added/),
    ).toBeInTheDocument();
    expect(within(notifications).getAllByText("Dismiss")).toHaveLength(2);

    await user.click(
      within(notifications).getByRole("button", {
        name: "Dismiss notification: 1 Markdown files found. 1 new note identities added.",
      }),
    );
    expect(
      within(notifications).getByText("0 Markdown files found."),
    ).toBeInTheDocument();
  });

  it("previews and explicitly applies existing-note identities", async () => {
    const user = userEvent.setup();
    const initialSnapshot = {
      files: [
        { name: "Legacy.md", parent: "", relativePath: "Legacy.md" },
        { name: "Unsafe.md", parent: "", relativePath: "Unsafe.md" },
      ],
      name: "My Vault",
      warnings: { ...noWarnings, identityConflicts: 1, needsIdentity: 1 },
    };
    mockedSelectVault.mockResolvedValue(initialSnapshot);
    mockedPreviewIdentityMigration.mockResolvedValue({
      eligibleFiles: ["Legacy.md"],
      issues: [{ reason: "malformedFrontMatter", relativePath: "Unsafe.md" }],
    });
    mockedApplyIdentityMigration.mockResolvedValue({
      migrated: 1,
      skipped: 0,
      snapshot: { ...initialSnapshot, warnings: noWarnings },
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      screen.getByRole("button", { name: "Review identity migration" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Add permanent note identities",
    });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Legacy.md")).toBeInTheDocument();
    expect(within(dialog).getByText(/Unsafe.md/)).toHaveTextContent(
      "Malformed front matter",
    );

    await user.click(
      screen.getByRole("button", { name: "Add IDs to 1 notes" }),
    );

    expect(mockedApplyIdentityMigration).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("1 existing note identities added."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Open vault" }));
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

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Empty.md" }));

    expect(mockedReadVaultFile).toHaveBeenCalledWith("Empty.md");
    expect(
      await screen.findByRole("textbox", { name: "Empty.md Markdown editor" }),
    ).toHaveAttribute("aria-placeholder", "Start writing…");
  });

  it("keeps rename visible while an identified note is opening", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
          name: "Opening.md",
          parent: "Notes",
          relativePath: "Notes/Opening.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockReturnValue(new Promise(() => undefined));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Opening.md" }));

    expect(
      screen.getByRole("button", { name: "Rename Opening.md" }),
    ).toBeDisabled();
    expect(screen.getByText("Opening Markdown…")).toBeInTheDocument();
  });

  it("renames an identified note and reloads updated vault content", async () => {
    const user = userEvent.setup();
    const identity = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          id: identity,
          name: "Old Name.md",
          parent: "Notes",
          relativePath: "Notes/Old Name.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile
      .mockResolvedValueOnce({
        content: "# Old Name\n",
        relativePath: "Notes/Old Name.md",
        sizeBytes: 11,
      })
      .mockResolvedValueOnce({
        content: "# Old Name\n",
        relativePath: "Writing/New Name.md",
        sizeBytes: 11,
      });
    mockedRenameVaultFile.mockResolvedValue({
      relativePath: "Writing/New Name.md",
      updatedFiles: 2,
      updatedLinks: 3,
    });
    mockedRescanVault.mockResolvedValue({
      files: [
        {
          id: identity,
          name: "New Name.md",
          parent: "Writing",
          relativePath: "Writing/New Name.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Old Name.md" }));
    await screen.findByRole("textbox", {
      name: "Old Name.md Markdown editor",
    });
    await user.click(
      screen.getByRole("button", { name: "Rename Old Name.md" }),
    );

    expect(mockedRenameVaultFile).toHaveBeenCalledWith("Notes/Old Name.md");
    expect(mockedRescanVault).toHaveBeenCalledTimes(1);
    expect(mockedReadVaultFile).toHaveBeenLastCalledWith("Writing/New Name.md");
    expect(
      await screen.findByRole("textbox", {
        name: "New Name.md Markdown editor",
      }),
    ).toHaveTextContent("# Old Name");
    expect(
      screen.getByText("New Name.md renamed. 3 links updated across 2 notes."),
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Open vault" }));
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

    await user.click(screen.getByRole("button", { name: "Open vault" }));
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

    await user.click(
      screen.getByRole("button", { name: /Open notification history/ }),
    );
    const history = screen.getByRole("dialog", {
      name: "Notification history",
    });
    expect(
      within(history).getByText(
        "Conflict.md has unsaved changes because its file changed outside Anchored.",
      ),
    ).toBeVisible();
    expect(
      within(history).getByRole("button", {
        name: "Delete notification: Conflict.md has unsaved changes because its file changed outside Anchored.",
      }),
    ).toBeVisible();
  });
});
