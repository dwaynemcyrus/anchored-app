import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectVault } from "../lib/tauri/vault";
import { App } from "./App";

vi.mock("../lib/tauri/vault", () => ({
  selectVault: vi.fn(),
}));

const mockedSelectVault = vi.mocked(selectVault);

describe("App", () => {
  beforeEach(() => mockedSelectVault.mockReset());

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

  it("replaces seeded files with a safely scanned vault", async () => {
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
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Open vault: Personal" }),
    );

    expect(screen.getByRole("button", { name: "Own Note.md" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.queryByRole("button", { name: "Leadership.md" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 Markdown files found.")).toBeInTheDocument();
  });
});
