import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVault,
  createVaultFolder,
  createUntitledVaultFile,
  createVaultFile,
  deleteVaultFolder,
  forgetVault,
  listRememberedVaults,
  listVaultTrash,
  moveVaultFileToFolder,
  moveVaultFileToTrash,
  openRememberedVault,
  readVaultFile,
  renameVaultFolder,
  renameVaultFile,
  rescanVault,
  saveVaultFile,
  searchVault,
  selectVault,
  restoreVaultFileFromTrash,
} from "../lib/tauri/vault";
import { App } from "./App";
import { saveSessionState } from "./sessionState";
import { reloadAnchoredWindow } from "./windowActions";

vi.mock("../lib/tauri/vault", () => ({
  createVault: vi.fn(),
  createVaultFolder: vi.fn(),
  createUntitledVaultFile: vi.fn(),
  createVaultFile: vi.fn(),
  deleteVaultFolder: vi.fn(),
  forgetVault: vi.fn(),
  listRememberedVaults: vi.fn(),
  listVaultTrash: vi.fn(),
  moveVaultFileToFolder: vi.fn(),
  moveVaultFileToTrash: vi.fn(),
  openRememberedVault: vi.fn(),
  readVaultFile: vi.fn(),
  renameVaultFolder: vi.fn(),
  renameVaultFile: vi.fn(),
  rescanVault: vi.fn(),
  saveVaultFile: vi.fn(),
  searchVault: vi.fn(),
  selectVault: vi.fn(),
  restoreVaultFileFromTrash: vi.fn(),
}));

vi.mock("./windowActions", () => ({
  reloadAnchoredWindow: vi.fn(),
}));

const mockedSelectVault = vi.mocked(selectVault);
const mockedCreateVault = vi.mocked(createVault);
const mockedCreateVaultFolder = vi.mocked(createVaultFolder);
const mockedCreateUntitledVaultFile = vi.mocked(createUntitledVaultFile);
const mockedCreateVaultFile = vi.mocked(createVaultFile);
const mockedDeleteVaultFolder = vi.mocked(deleteVaultFolder);
const mockedForgetVault = vi.mocked(forgetVault);
const mockedListRememberedVaults = vi.mocked(listRememberedVaults);
const mockedListVaultTrash = vi.mocked(listVaultTrash);
const mockedMoveVaultFileToFolder = vi.mocked(moveVaultFileToFolder);
const mockedMoveVaultFileToTrash = vi.mocked(moveVaultFileToTrash);
const mockedOpenRememberedVault = vi.mocked(openRememberedVault);
const mockedReadVaultFile = vi.mocked(readVaultFile);
const mockedRenameVaultFolder = vi.mocked(renameVaultFolder);
const mockedRenameVaultFile = vi.mocked(renameVaultFile);
const mockedRescanVault = vi.mocked(rescanVault);
const mockedSaveVaultFile = vi.mocked(saveVaultFile);
const mockedSearchVault = vi.mocked(searchVault);
const mockedRestoreVaultFileFromTrash = vi.mocked(restoreVaultFileFromTrash);
const mockedReloadAnchoredWindow = vi.mocked(reloadAnchoredWindow);
const noWarnings = {
  skippedNonUtf8Paths: 0,
  skippedSymlinks: 0,
};

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    window.localStorage.clear();
    mockedCreateVault.mockReset();
    mockedCreateVaultFolder.mockReset();
    mockedCreateUntitledVaultFile.mockReset();
    mockedCreateVaultFile.mockReset();
    mockedDeleteVaultFolder.mockReset();
    mockedForgetVault.mockReset();
    mockedListRememberedVaults.mockReset();
    mockedListVaultTrash.mockReset();
    mockedMoveVaultFileToFolder.mockReset();
    mockedMoveVaultFileToTrash.mockReset();
    mockedOpenRememberedVault.mockReset();
    mockedSelectVault.mockReset();
    mockedReadVaultFile.mockReset();
    mockedRenameVaultFolder.mockReset();
    mockedRenameVaultFile.mockReset();
    mockedRescanVault.mockReset();
    mockedSaveVaultFile.mockReset();
    mockedSearchVault.mockReset();
    mockedRestoreVaultFileFromTrash.mockReset();
    mockedReloadAnchoredWindow.mockReset();
    mockedCreateUntitledVaultFile.mockImplementation(
      () => new Promise(() => {}),
    );
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
      screen.getByRole("button", { name: "Open a vault" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a vault" }),
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

  it("restores the current vault and note from saved session state", async () => {
    const sessionVault = {
      available: true,
      id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      lastOpenedAt: Date.UTC(2026, 6, 17, 8),
      name: "My Vault",
    };
    saveSessionState(window.localStorage, {
      activeRelativePath: "Notes/Leadership.md",
      vaultId: sessionVault.id,
    });
    mockedListRememberedVaults.mockResolvedValue([sessionVault]);
    mockedOpenRememberedVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: sessionVault.name,
      vaultId: sessionVault.id,
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Leadership",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 12,
    });
    render(<App />);

    await waitFor(() =>
      expect(mockedOpenRememberedVault).toHaveBeenCalledWith(sessionVault.id),
    );
    await waitFor(() =>
      expect(mockedReadVaultFile).toHaveBeenCalledWith("Notes/Leadership.md"),
    );
    expect(
      await screen.findByRole("button", {
        name: "Switch vault: My Vault",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Leadership.md" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("shows the vault file count without creating a notification", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    expect(screen.getByText("0 Markdown files")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Open notification history" }),
    );

    const history = screen.getByRole("dialog", {
      name: "Notification history",
    });
    expect(within(history).getByText("No notifications yet.")).toBeVisible();
  });

  it("auto-dismisses minor notices after 12 seconds", async () => {
    vi.useFakeTimers();
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: { ...noWarnings, skippedSymlinks: 1 },
    });
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open vault" }));
      await Promise.resolve();
    });
    expect(
      screen.getByText("1 symlink entry was skipped for safety."),
    ).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(
      screen.queryByText("1 symlink entry was skipped for safety."),
    ).not.toBeInTheDocument();
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

  it("creates and opens a new vault from the no-vault state", async () => {
    const user = userEvent.setup();
    mockedCreateVault.mockResolvedValue({
      files: [],
      name: "Second Brain",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Create a vault" }));
    const dialog = screen.getByRole("dialog", { name: "Create vault" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Vault name" }),
      "Second Brain",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Choose location…" }),
    );

    expect(mockedCreateVault).toHaveBeenCalledWith({ name: "Second Brain" });
    expect(
      await screen.findByRole("button", {
        name: "Switch vault: Second Brain",
      }),
    ).toBeVisible();
  });

  it("creates a root folder from the file rail", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      folders: [],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    mockedCreateVaultFolder.mockResolvedValue({
      files: [],
      folders: ["Projects"],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      screen.getByRole("button", { name: "Create folder at vault root" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Create folder" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Folder name" }),
      "Projects",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create folder" }),
    );

    expect(mockedCreateVaultFolder).toHaveBeenCalledWith({
      name: "Projects",
      parentPath: undefined,
    });
    expect(
      await screen.findByRole("button", { name: "Projects" }),
    ).toBeVisible();
  });

  it("creates a subfolder from a folder row action", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      folders: ["Projects"],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    mockedCreateVaultFolder.mockResolvedValue({
      files: [],
      folders: ["Projects", "Projects/Inbox"],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      screen.getByRole("button", { name: "Create subfolder inside Projects" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Create folder" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Folder name" }),
      "Inbox",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create folder" }),
    );

    expect(mockedCreateVaultFolder).toHaveBeenCalledWith({
      name: "Inbox",
      parentPath: "Projects",
    });
    expect(await screen.findByRole("button", { name: "Inbox" })).toBeVisible();
  });

  it("renames a folder from a folder row action", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      folders: ["Projects", "Projects/Inbox"],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    mockedRenameVaultFolder.mockResolvedValue({
      files: [],
      folders: ["Archive", "Archive/Inbox"],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      screen.getByRole("button", { name: "Rename Projects folder" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Rename folder" });
    const input = within(dialog).getByRole("textbox", {
      name: "New folder name",
    });
    await user.clear(input);
    await user.type(input, "Archive");
    await user.click(
      within(dialog).getByRole("button", { name: "Rename folder" }),
    );

    expect(mockedRenameVaultFolder).toHaveBeenCalledWith({
      folderPath: "Projects",
      name: "Archive",
    });
    expect(
      await screen.findByRole("button", { name: "Archive" }),
    ).toBeVisible();
  });

  it("deletes an empty folder from a folder row action", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [],
      folders: ["Archive"],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    mockedDeleteVaultFolder.mockResolvedValue({
      files: [],
      folders: [],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      screen.getByRole("button", { name: "Delete Archive folder" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Delete folder" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete folder" }),
    );

    expect(mockedDeleteVaultFolder).toHaveBeenCalledWith("Archive");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Archive" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("reloads from settings after saving the active note", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1CA",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Leadership",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 12,
    });
    mockedSaveVaultFile.mockImplementation(async (request) => ({
      content: request.content,
      relativePath: request.relativePath,
      sizeBytes: request.content.length,
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Leadership.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Leadership.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard(" updated");
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const settings = screen.getByRole("dialog", { name: "Settings" });
    await user.click(
      within(settings).getByRole("button", { name: "Reload Anchored" }),
    );

    await waitFor(() => expect(mockedSaveVaultFile).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockedReloadAnchoredWindow).toHaveBeenCalledTimes(1),
    );
  });

  it("reloads from settings with no vault open", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole(
        "button",
        { name: "Reload Anchored" },
      ),
    );

    await waitFor(() =>
      expect(mockedReloadAnchoredWindow).toHaveBeenCalledTimes(1),
    );
  });

  it("opens an on-demand Markdown preview and follows rendered wikilinks", async () => {
    const user = userEvent.setup();
    const leadership = {
      id: "01JZQ7K8P4A6F2M9V3C5T7X1BY",
      name: "Leadership.md",
      parent: "Notes",
      relativePath: "Notes/Leadership.md",
    };
    const other = {
      id: "01JZQ91T3AA6F2M9V3C5T7X1BZ",
      name: "Other.md",
      parent: "Notes",
      relativePath: "Notes/Other.md",
    };
    mockedSelectVault.mockResolvedValue({
      files: [leadership, other],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockImplementation(async (relativePath) => ({
      content:
        relativePath === leadership.relativePath ? "# [[Other]]" : "# Other",
      relativePath,
      sizeBytes: relativePath === leadership.relativePath ? 11 : 7,
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: leadership.name }));
    await screen.findByRole("textbox", {
      name: "Leadership.md Markdown editor",
    });
    await user.click(screen.getByRole("button", { name: "Preview" }));

    const preview = await screen.findByRole("article", {
      name: "Leadership.md Markdown preview",
    });
    expect(preview).toHaveTextContent("Other");
    await user.click(within(preview).getByRole("link", { name: "Other" }));

    await waitFor(() =>
      expect(mockedReadVaultFile).toHaveBeenCalledWith(other.relativePath),
    );
    expect(
      await screen.findByRole("article", {
        name: "Other.md Markdown preview",
      }),
    ).toHaveTextContent("Other");
    await user.click(screen.getByRole("button", { name: "Edit source" }));
    expect(
      await screen.findByRole("textbox", { name: "Other.md Markdown editor" }),
    ).toBeInTheDocument();
  });

  it("blocks reload from settings when a note has a save conflict", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      name: "My Vault",
      vaultId: "01JZQ7K8P4A6F2M9V3C5T7X1CA",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Leadership",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 12,
    });
    mockedSaveVaultFile.mockRejectedValue(
      Object.assign(new Error("The file changed outside Anchored."), {
        code: "vaultConflict",
      }),
    );
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Leadership.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Leadership.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard(" updated");
    await user.keyboard("{Meta>}s{/Meta}");

    await screen.findByText("The file changed outside Anchored.");
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole(
        "button",
        { name: "Reload Anchored" },
      ),
    );

    expect(mockedReloadAnchoredWindow).not.toHaveBeenCalled();
    expect(
      screen.getByText("Resolve note save problems before reloading Anchored."),
    ).toBeVisible();
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

  it("drags a saved note into another folder", async () => {
    const vaultId = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
    const original = {
      content: "# Leadership",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 12,
    };
    const moved = {
      content: "# Leadership",
      relativePath: "Archive/Leadership.md",
      sizeBytes: 12,
    };
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      folders: ["Archive", "Notes"],
      name: "My Vault",
      vaultId,
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockImplementation(async (relativePath) =>
      relativePath === moved.relativePath ? moved : original,
    );
    mockedMoveVaultFileToFolder.mockResolvedValue({
      relativePath: moved.relativePath,
      updatedFiles: 0,
      updatedLinks: 0,
    });
    mockedRescanVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Archive",
          relativePath: moved.relativePath,
        },
      ],
      folders: ["Archive", "Notes"],
      name: "My Vault",
      vaultId,
      warnings: noWarnings,
    });
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Open vault" }));
    const note = await screen.findByRole("button", { name: "Leadership.md" });
    const archiveFolder = screen.getByRole("button", { name: "Archive" });
    fireEvent.dragStart(note, {
      dataTransfer: {
        effectAllowed: "move",
        setData: vi.fn(),
      },
    });
    fireEvent.dragOver(archiveFolder);
    fireEvent.drop(archiveFolder);

    await waitFor(() =>
      expect(mockedMoveVaultFileToFolder).toHaveBeenCalledWith(
        "Notes/Leadership.md",
        "Archive",
      ),
    );
    expect(
      await screen.findByText(
        "Leadership.md moved to Archive. 0 links updated across 0 notes.",
      ),
    ).toBeVisible();
  });

  it("moves a saved note through the move dialog", async () => {
    const user = userEvent.setup();
    const vaultId = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
    const original = {
      content: "# Leadership",
      relativePath: "Notes/Leadership.md",
      sizeBytes: 12,
    };
    const moved = {
      content: "# Leadership",
      relativePath: "Archive/Leadership.md",
      sizeBytes: 12,
    };
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
      ],
      folders: ["Archive", "Notes"],
      name: "My Vault",
      vaultId,
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockImplementation(async (relativePath) =>
      relativePath === moved.relativePath ? moved : original,
    );
    mockedMoveVaultFileToFolder.mockResolvedValue({
      relativePath: moved.relativePath,
      updatedFiles: 0,
      updatedLinks: 0,
    });
    mockedRescanVault.mockResolvedValue({
      files: [
        {
          name: "Leadership.md",
          parent: "Archive",
          relativePath: moved.relativePath,
        },
      ],
      folders: ["Archive", "Notes"],
      name: "My Vault",
      vaultId,
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(
      await screen.findByRole("button", { name: "Leadership.md" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Move Leadership.md" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Move note" });
    const archiveRow = within(dialog).getByText("Archive").closest("li");
    expect(archiveRow).not.toBeNull();
    await user.click(
      within(archiveRow as HTMLElement).getByRole("button", { name: "Move" }),
    );

    await waitFor(() =>
      expect(mockedMoveVaultFileToFolder).toHaveBeenCalledWith(
        "Notes/Leadership.md",
        "Archive",
      ),
    );
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
          name: "Leadership.md",
          parent: "Notes",
          relativePath: "Notes/Leadership.md",
        },
        {
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

  it("keeps newer local drafts available while their first saves run", async () => {
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
    expect(screen.getByText("Saving…")).toBeInTheDocument();

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

  it("starts saving an empty new note immediately", async () => {
    const createdContent = "";
    let finishCreatingNote:
      | ((value: {
          content: string;
          relativePath: string;
          sizeBytes: number;
        }) => void)
      | null = null;
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedCreateUntitledVaultFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreatingNote = resolve;
        }),
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "New note" })[0]);

    expect(mockedCreateUntitledVaultFile).toHaveBeenCalledOnce();
    expect(mockedCreateUntitledVaultFile).toHaveBeenCalledWith("");
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    await act(async () => {
      finishCreatingNote?.({
        content: createdContent,
        relativePath: "Untitled.md",
        sizeBytes: createdContent.length,
      });
    });

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("1 Markdown file")).toBeInTheDocument();
  });

  it("keeps typing safe while the first note file is created", async () => {
    const user = userEvent.setup();
    const createdContent = "";
    let finishCreatingNote:
      | ((value: {
          content: string;
          relativePath: string;
          sizeBytes: number;
        }) => void)
      | null = null;
    mockedSelectVault.mockResolvedValue({
      files: [],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedCreateUntitledVaultFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreatingNote = resolve;
        }),
    );
    mockedSaveVaultFile.mockImplementation(async (request) => ({
      content: request.content,
      relativePath: request.relativePath,
      sizeBytes: request.content.length,
    }));
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
    const editor = await screen.findByRole("textbox", {
      name: "Untitled.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard("# Draft");

    await act(async () => {
      finishCreatingNote?.({
        content: createdContent,
        relativePath: "Untitled.md",
        sizeBytes: createdContent.length,
      });
    });

    await waitFor(() => expect(mockedSaveVaultFile).toHaveBeenCalled());
    expect(mockedSaveVaultFile.mock.calls[0][0].content).toContain("# Draft");
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
          name: "Source.md",
          parent: "Notes",
          relativePath: "Notes/Source.md",
        },
        {
          aliases: ["Leading Well"],
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
    expect(screen.getByText("1 Markdown file")).toBeInTheDocument();
    expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();

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
      warnings: noWarnings,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    window.dispatchEvent(new Event("focus"));

    expect(
      await screen.findByRole("button", { name: "Finder Note.md" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 Markdown file")).toBeInTheDocument();
    expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();
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

  it("renames a note and reloads updated vault content", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
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

  it("normalizes CRLF to LF on an intentional save", async () => {
    const user = userEvent.setup();
    mockedSelectVault.mockResolvedValue({
      files: [
        {
          name: "Line Endings.md",
          parent: "Notes",
          relativePath: "Notes/Line Endings.md",
        },
      ],
      name: "My Vault",
      warnings: noWarnings,
    });
    mockedReadVaultFile.mockResolvedValue({
      content: "# Before\r\n",
      relativePath: "Notes/Line Endings.md",
      sizeBytes: 10,
    });
    mockedSaveVaultFile.mockResolvedValue({
      content: " updated# Before\n",
      relativePath: "Notes/Line Endings.md",
      sizeBytes: 18,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open vault" }));
    await user.click(screen.getByRole("button", { name: "Line Endings.md" }));
    const editor = await screen.findByRole("textbox", {
      name: "Line Endings.md Markdown editor",
    });
    await user.click(editor);
    await user.keyboard(" updated");
    await user.keyboard("{Meta>}s{/Meta}");

    expect(mockedSaveVaultFile).toHaveBeenCalledWith({
      content: " updated# Before\n",
      expectedContent: "# Before\r\n",
      relativePath: "Notes/Line Endings.md",
    });
    expect(
      await screen.findByText("Saved with Unix (LF) line endings."),
    ).toBeInTheDocument();
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
