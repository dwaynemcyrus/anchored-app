import { beforeEach, describe, expect, it } from "vitest";

import { invokeDevelopmentFixture } from "./devFixture";
import type { VaultSnapshot } from "./vault";

describe("development fixture vault", () => {
  beforeEach(async () => {
    await invokeDevelopmentFixture<VaultSnapshot>("open_development_vault");
  });

  it("contains the complete 48-file fixture and representative collections", async () => {
    const snapshot =
      await invokeDevelopmentFixture<VaultSnapshot>("rescan_vault");

    expect(snapshot.files).toHaveLength(46);
    expect(snapshot.assets).toHaveLength(2);
    expect(
      snapshot.files.filter((file) => file.noteType === "scratchpad"),
    ).toHaveLength(3);
    expect(
      snapshot.files.filter((file) => file.status === "archived"),
    ).toHaveLength(7);
    expect(
      snapshot.files.some(
        (file) => file.relativePath === "inbox/Capture - Welcome.md",
      ),
    ).toBe(true);
    expect(
      snapshot.files.some(
        (file) => file.relativePath === "workbench/Project - Lighthouse.md",
      ),
    ).toBe(true);
    expect(snapshot.folders).toEqual(
      expect.arrayContaining([
        "archive",
        "guides",
        "inbox",
        "projects",
        "reading",
        "workbench",
      ]),
    );
  });

  it("reads, searches, and resets fixture content", async () => {
    await expect(
      invokeDevelopmentFixture<unknown[]>("list_vault_trash"),
    ).resolves.toEqual([]);

    const welcome = await invokeDevelopmentFixture<{ content: string }>(
      "read_vault_file",
      { relativePath: "inbox/Capture - Welcome.md" },
    );
    expect(welcome.content).toContain("Project - Lighthouse");

    const search = await invokeDevelopmentFixture<{
      matches: Array<{ relativePath: string }>;
    }>("search_vault", { query: "mermaid" });
    expect(
      search.matches.some(
        (match) => match.relativePath === "inbox/Mermaid Diagram.md",
      ),
    ).toBe(true);

    await invokeDevelopmentFixture("save_vault_file", {
      content: "# Temporary browser edit\n",
      expectedContent: welcome.content,
      relativePath: "inbox/Capture - Welcome.md",
    });
    await invokeDevelopmentFixture("open_development_vault");
    const reset = await invokeDevelopmentFixture<{ content: string }>(
      "read_vault_file",
      { relativePath: "inbox/Capture - Welcome.md" },
    );
    expect(reset.content).toBe(welcome.content);
  });
});
