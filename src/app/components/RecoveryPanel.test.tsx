import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecoveryPanel } from "./RecoveryPanel";
import type { NoteVersion, VaultConflict } from "../../lib/tauri/vault";

const conflict: VaultConflict = {
  uuid: "019f989c-2dc0-7a01-8b2c-4d5e6f708192",
  relativePath: "Notes/Harbor.md",
  name: "Harbor.md",
  databaseCopyPath: ".anchored/conflicts/019f989c_database.md",
  fileCopyPath: ".anchored/conflicts/019f989c_file.md",
  detectedMillis: 1_784_964_600_000,
};

const version: NoteVersion = {
  revision: 3,
  content: "---\nid: 019f\n---\n# Harbor as it was\n",
  origin: "external_file",
  createdMillis: 1_784_964_600_000,
};

function renderPanel(
  props: Partial<React.ComponentProps<typeof RecoveryPanel>>,
) {
  return render(
    <RecoveryPanel
      conflicts={[]}
      loading={false}
      versions={[]}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("RecoveryPanel", () => {
  it("says plainly when there is nothing to act on", () => {
    renderPanel({});

    expect(screen.getByText("Nothing is waiting on you.")).toBeInTheDocument();
  });

  it("names both preserved copies of a conflict without offering to open them", () => {
    renderPanel({ conflicts: [conflict] });

    expect(screen.getByText("Harbor.md")).toBeInTheDocument();
    expect(screen.getByText(conflict.databaseCopyPath)).toBeInTheDocument();
    expect(screen.getByText(conflict.fileCopyPath)).toBeInTheDocument();
    // The copies live in the vault's hidden folder, which Anchored does not
    // open as notes, so there must be no control implying otherwise.
    expect(
      screen.queryByRole("button", { name: /open/i }),
    ).not.toBeInTheDocument();
  });

  it("reassures that a conflict lost nothing", () => {
    renderPanel({ conflicts: [conflict] });

    expect(screen.getByText(/nothing was overwritten/i)).toBeInTheDocument();
  });

  it("describes where a version came from in plain words", () => {
    renderPanel({ versions: [version], versionsFor: "Notes/Harbor.md" });

    expect(screen.getByText("Changed outside Anchored")).toBeInTheDocument();
    // The front matter delimiter is not a useful summary of a note.
    expect(screen.getByText("# Harbor as it was")).toBeInTheDocument();
  });

  it("names the note the way the rest of the interface does", () => {
    renderPanel({
      versions: [version],
      versionsFor: "inbox/Habit Experiments.md",
    });

    expect(
      screen.getByRole("heading", {
        name: "Earlier versions of Habit Experiments",
      }),
    ).toBeInTheDocument();
  });

  it("lets the reader see the whole version, not just a summary of it", () => {
    renderPanel({ versions: [version], versionsFor: "Notes/Harbor.md" });

    // Collapsed by default so a long note does not bury the list, but present
    // — a version you cannot read is not recovery.
    expect(screen.getByText("Show this version")).toBeInTheDocument();
    // Matched on the element's own text, because the testing library
    // normalises whitespace and a note's line breaks are the point.
    const shown = document.querySelector(".recovery-version__content");
    expect(shown?.textContent).toBe(version.content);
  });

  it("asks the reader to open a note before showing versions", () => {
    renderPanel({});

    expect(
      screen.getByText(/open a note to see the versions kept for it/i),
    ).toBeInTheDocument();
  });

  it("surfaces a failure rather than showing an empty panel", () => {
    renderPanel({ error: "The vault index could not be opened." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The vault index could not be opened.",
    );
  });
});
