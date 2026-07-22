import { describe, expect, it } from "vitest";

import {
  displayFileName,
  displayFilePath,
  fileExtension,
  fileTypeForName,
} from "./fileTypes";

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

  it("hides or preserves extensions consistently for display", () => {
    expect(displayFileName("Note.md", false)).toBe("Note");
    expect(displayFileName("Note.md", true)).toBe("Note.md");
    expect(displayFileName(".obsidian", false)).toBe(".obsidian");
    expect(displayFileName("Archive.tar.gz", false)).toBe("Archive.tar");
    expect(displayFilePath("Notes/Note.md", false)).toBe("Notes/Note");
    expect(displayFilePath("Notes/Note.md", true)).toBe("Notes/Note.md");
  });
});
