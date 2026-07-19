import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createScratchpadNote,
  latestScratchpadNote,
  loadScratchpadLinkCandidates,
  openScratchpad,
  saveScratchpadNote,
} from "./scratchpad";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

describe("Scratchpad bridge", () => {
  beforeEach(() => mockedInvoke.mockReset());

  it("uses narrow native commands for window, persistence, and links", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await openScratchpad("new");
    await createScratchpadNote("Body");
    await saveScratchpadNote({
      body: "Updated",
      expectedContent: "persisted",
      relativePath: "Scratchpad.md",
    });
    await latestScratchpadNote();
    await loadScratchpadLinkCandidates();

    expect(mockedInvoke.mock.calls).toEqual([
      ["open_scratchpad", { mode: "new" }],
      ["create_scratchpad_note", { body: "Body" }],
      [
        "save_scratchpad_note",
        {
          body: "Updated",
          expectedContent: "persisted",
          relativePath: "Scratchpad.md",
        },
      ],
      ["latest_scratchpad_note"],
      ["scratchpad_link_candidates"],
    ]);
  });
});
