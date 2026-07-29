import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnchoredDocument } from "../documents";
import { InspectorPane } from "./InspectorPane";

function note(name: string): AnchoredDocument {
  return {
    aliases: [],
    body: "",
    folder: "Knowledge",
    id: name,
    name,
    outgoingLinks: [],
    relativePath: `Knowledge/${name}`,
    tags: [],
    title: name.replace(/\.md$/, ""),
  };
}

function setup(overrides: Partial<Parameters<typeof InspectorPane>[0]> = {}) {
  const onOpen = vi.fn();
  const onUnpinReference = vi.fn();
  render(
    <InspectorPane
      backlinks={[]}
      hasDocument
      showFileExtensions={false}
      onOpen={onOpen}
      onUnpinReference={onUnpinReference}
      {...overrides}
    />,
  );
  return { onOpen, onUnpinReference };
}

describe("InspectorPane backlinks", () => {
  it("says when nothing links to the note", () => {
    setup();
    expect(screen.getByText("Nothing links here yet")).toBeInTheDocument();
  });

  it("says when there is no note at all", () => {
    setup({ hasDocument: false });
    expect(screen.getByText("No note open")).toBeInTheDocument();
  });

  it("lists backlinks and opens one", async () => {
    const user = userEvent.setup();
    const { onOpen } = setup({ backlinks: [note("Field Notes.md")] });

    expect(screen.getByText("1")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Knowledge/Field Notes" }),
    );

    expect(onOpen).toHaveBeenCalledWith("Field Notes.md");
  });
});

describe("InspectorPane pinned reference", () => {
  it("shows no reference section until one is pinned", () => {
    setup();
    expect(
      screen.queryByRole("region", { name: "Reference" }),
    ).not.toBeInTheDocument();
  });

  it("shows the pinned document above backlinks", () => {
    setup({ pinnedReference: note("Harbor.md") });

    const reference = screen.getByRole("region", { name: "Reference" });
    expect(
      within(reference).getByRole("heading", { name: "Reference" }),
    ).toBeInTheDocument();
    expect(
      within(reference).getByRole("button", { name: "Knowledge/Harbor" }),
    ).toBeInTheDocument();
  });

  it("opens the reference when it is clicked", async () => {
    const user = userEvent.setup();
    const { onOpen } = setup({ pinnedReference: note("Harbor.md") });

    const reference = screen.getByRole("region", { name: "Reference" });
    await user.click(
      within(reference).getByRole("button", { name: "Knowledge/Harbor" }),
    );

    expect(onOpen).toHaveBeenCalledWith("Harbor.md");
  });

  it("unpins from the reference section", async () => {
    const user = userEvent.setup();
    const { onUnpinReference } = setup({ pinnedReference: note("Harbor.md") });

    await user.click(
      screen.getByRole("button", {
        name: "Unpin Knowledge/Harbor as reference",
      }),
    );

    expect(onUnpinReference).toHaveBeenCalled();
  });

  /// The reference is what you are consulting while you work elsewhere, so it
  /// stays put regardless of what the editor is showing — including nothing.
  it("stays when no note is open", () => {
    setup({ hasDocument: false, pinnedReference: note("Harbor.md") });

    expect(
      screen.getByRole("region", { name: "Reference" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No note open")).toBeInTheDocument();
  });
});
