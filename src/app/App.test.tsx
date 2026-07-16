import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
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
});
