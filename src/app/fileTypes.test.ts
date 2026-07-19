import { describe, expect, it } from "vitest";

import { fileExtension, fileTypeForName } from "./fileTypes";

describe("file types", () => {
  it("recognizes common vault file types case-insensitively", () => {
    expect(fileTypeForName("Cover.JPG")).toBe("image");
    expect(fileTypeForName("Paper.pdf")).toBe("pdf");
    expect(fileTypeForName("Audio.MP3")).toBe("audio");
    expect(fileTypeForName("Archive.zip")).toBe("archive");
    expect(fileTypeForName("Note.md")).toBe("markdown");
  });

  it("extracts extensions without treating dotfiles as extensions", () => {
    expect(fileExtension("Notes/Idea.md")).toBe("md");
    expect(fileExtension(".obsidian")).toBe("");
  });
});
