import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MARKDOWN_SETTINGS } from "../markdown/types";
import { SettingsModal } from "./SettingsModal";

describe("SettingsModal Markdown options", () => {
  it("exposes every Version 1 render option without editing source", async () => {
    const user = userEvent.setup();
    const onMarkdownSettingsChange = vi.fn();

    render(
      <SettingsModal
        markdownSettings={DEFAULT_MARKDOWN_SETTINGS}
        reloading={false}
        onClose={vi.fn()}
        onMarkdownSettingsChange={onMarkdownSettingsChange}
        onReload={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const toggles = screen.getAllByRole("checkbox");
    expect(toggles).toHaveLength(5);
    expect(
      toggles.every((toggle) => (toggle as HTMLInputElement).checked),
    ).toBe(true);

    await user.click(toggles[0]);
    expect(onMarkdownSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_MARKDOWN_SETTINGS,
      autoLinkUrls: false,
    });
    expect(dialog).toHaveTextContent("Rendering options never rewrite");
  });
});
