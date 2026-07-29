import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createWorkspace,
  leaves,
  openDocument,
  type Workspace,
} from "../workspaceTree";
import { WorkspaceEditor } from "./WorkspaceEditor";

/// Renders the component against real workspace state, so what is under test is
/// the whole loop — a click becoming a model change becoming a new render —
/// rather than a callback firing into nothing.
function setup(initial: Workspace, onNewTab = vi.fn()) {
  function Harness() {
    const [workspace, setWorkspace] = useState(initial);
    return (
      <WorkspaceEditor
        renderEditor={({ documentId, groupId, isActiveGroup }) => (
          <div data-testid={`editor-${groupId}`}>
            {documentId || "nothing open"}
            {isActiveGroup ? " (active)" : ""}
          </div>
        )}
        titleFor={(documentId) => documentId.replace(/-/g, " ")}
        workspace={workspace}
        onNewTab={onNewTab}
        onWorkspaceChange={(change) => setWorkspace(change)}
      />
    );
  }
  render(<Harness />);
  return { onNewTab };
}

function withDocuments(...documentIds: string[]) {
  let workspace = createWorkspace();
  for (const documentId of documentIds) {
    workspace = openDocument(workspace, documentId, { newTab: true });
  }
  return workspace;
}

async function openTabMenu(name: string | RegExp) {
  const user = userEvent.setup();
  await user.pointer({
    keys: "[MouseRight]",
    target: screen.getByRole("tab", { name }),
  });
  return within(screen.getByRole("menu", { name: "Tab actions" }));
}

describe("WorkspaceEditor", () => {
  it("shows the active tab's document", () => {
    setup(withDocuments("harbor", "field-notes"));

    // The harness renders the raw id; the title is the strip's business.
    expect(screen.getByTestId(/^editor-/)).toHaveTextContent("field-notes");
  });

  it("switches document when another tab is chosen", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor", "field-notes"));

    await user.click(screen.getByRole("tab", { name: "harbor" }));

    expect(screen.getByTestId(/^editor-/)).toHaveTextContent("harbor");
  });

  it("closes a tab and falls back to what remains", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor", "field-notes"));

    await user.click(screen.getByRole("button", { name: "Close field notes" }));

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByTestId(/^editor-/)).toHaveTextContent("harbor");
  });

  it("leaves an empty group behind when the last tab closes", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    await user.click(screen.getByRole("button", { name: "Close harbor" }));

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByTestId(/^editor-/)).toHaveTextContent("nothing open");
  });

  it("asks the application for a new tab's contents", async () => {
    const user = userEvent.setup();
    const workspace = withDocuments("harbor");
    const { onNewTab } = setup(workspace);

    await user.click(screen.getByRole("button", { name: "New tab" }));

    expect(onNewTab).toHaveBeenCalledWith(leaves(workspace.root)[0].id);
  });
});

describe("WorkspaceEditor splits", () => {
  it("splits a group in two and shows both", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    const menu = await openTabMenu("harbor");
    await user.click(menu.getByRole("menuitem", { name: "Split right" }));

    expect(screen.getAllByTestId(/^editor-/)).toHaveLength(2);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("splits downwards too", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    const menu = await openTabMenu("harbor");
    await user.click(menu.getByRole("menuitem", { name: "Split down" }));

    expect(screen.getByRole("separator")).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
  });

  it("marks only one group active, so it is clear what a command will hit", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    const menu = await openTabMenu("harbor");
    await user.click(menu.getByRole("menuitem", { name: "Split right" }));

    const editors = screen.getAllByTestId(/^editor-/);
    const active = editors.filter((editor) =>
      editor.textContent?.includes("(active)"),
    );
    expect(active).toHaveLength(1);
    // Splitting leaves you looking at the half you asked for.
    expect(active[0]).toBe(editors[1]);
  });

  it("makes a group active when it is clicked in", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));
    const menu = await openTabMenu("harbor");
    await user.click(menu.getByRole("menuitem", { name: "Split right" }));

    const firstGroupTab = screen.getAllByRole("tab")[0];
    await user.click(firstGroupTab);

    const editors = screen.getAllByTestId(/^editor-/);
    expect(editors[0]).toHaveTextContent("(active)");
    expect(editors[1]).not.toHaveTextContent("(active)");
  });

  it("collapses the split when a half is emptied", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));
    const menu = await openTabMenu("harbor");
    await user.click(menu.getByRole("menuitem", { name: "Split right" }));

    // Close the copy that the split created.
    await user.click(
      screen.getAllByRole("button", { name: "Close harbor" })[1],
    );

    expect(screen.getAllByTestId(/^editor-/)).toHaveLength(1);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});

describe("WorkspaceEditor tab menu", () => {
  it("closes the other tabs", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor", "field-notes", "link-garden"));

    const menu = await openTabMenu("field notes");
    await user.click(menu.getByRole("menuitem", { name: "Close others" }));

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab")).toHaveAccessibleName("field notes");
  });

  it("closes the tabs to the right", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor", "field-notes", "link-garden"));

    const menu = await openTabMenu("harbor");
    await user.click(
      menu.getByRole("menuitem", { name: "Close tabs to the right" }),
    );

    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("pins a tab and offers to unpin it again", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    let menu = await openTabMenu("harbor");
    await user.click(menu.getByRole("menuitemcheckbox", { name: "Pin tab" }));
    expect(screen.getByRole("tab")).toHaveAccessibleName("harbor, pinned");

    menu = await openTabMenu("harbor, pinned");
    expect(
      menu.getByRole("menuitemcheckbox", { name: "Unpin tab" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  /// A pinned reference and a pinned tab are easily confused, so the menu shows
  /// both and this checks the reference one reaches the reference.
  it("pins a document as a reference without pinning its tab", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    const menu = await openTabMenu("harbor");
    await user.click(
      menu.getByRole("menuitemcheckbox", { name: "Pin as reference" }),
    );

    // The tab itself is untouched: no pin marker, so its name is unchanged.
    expect(screen.getByRole("tab")).toHaveAccessibleName("harbor");

    const reopened = await openTabMenu("harbor");
    expect(
      reopened.getByRole("menuitemcheckbox", { name: "Unpin as reference" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    setup(withDocuments("harbor"));

    await openTabMenu("harbor");
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("menu", { name: "Tab actions" }),
    ).not.toBeInTheDocument();
  });
});
