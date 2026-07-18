import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MARKDOWN_SETTINGS } from "../markdown/types";
import MarkdownPreview from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders source features and opens wikilinks through the app resolver", () => {
    const onOpenWikilink = vi.fn();
    render(
      <MarkdownPreview
        label="Leadership Markdown preview"
        onOpenWikilink={onOpenWikilink}
        settings={DEFAULT_MARKDOWN_SETTINGS}
        source={`# Leadership

[[Project:Anchored|Anchored project]]`}
      />,
    );

    expect(screen.getByRole("heading", { name: "Leadership" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Anchored project" }));
    expect(onOpenWikilink).toHaveBeenCalledWith("Project:Anchored");
  });
});
