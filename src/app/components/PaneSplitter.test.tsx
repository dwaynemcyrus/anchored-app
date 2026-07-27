import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { paneConstraints } from "../paneLayout";
import { PaneSplitter } from "./PaneSplitter";

function setup(overrides: Partial<Parameters<typeof PaneSplitter>[0]> = {}) {
  const onResize = vi.fn();
  const onCollapse = vi.fn();
  const onReset = vi.fn();

  render(
    <PaneSplitter
      label="Resize navigation pane"
      pane="navigation"
      width={240}
      onCollapse={onCollapse}
      onReset={onReset}
      onResize={onResize}
      {...overrides}
    />,
  );

  return {
    onCollapse,
    onReset,
    onResize,
    splitter: screen.getByRole("separator", { name: /resize/i }),
  };
}

describe("PaneSplitter", () => {
  it("exposes its current and permitted widths", () => {
    const { splitter } = setup();

    expect(splitter).toHaveAttribute("aria-valuenow", "240");
    expect(splitter).toHaveAttribute(
      "aria-valuemin",
      String(paneConstraints.navigation.min),
    );
    expect(splitter).toHaveAttribute(
      "aria-valuemax",
      String(paneConstraints.navigation.max),
    );
  });

  it("resizes by 16px with an arrow key and 64px with Shift", async () => {
    const user = userEvent.setup();
    const { onResize, splitter } = setup();

    splitter.focus();
    await user.keyboard("{ArrowRight}");
    expect(onResize).toHaveBeenLastCalledWith(256);

    await user.keyboard("{ArrowLeft}");
    expect(onResize).toHaveBeenLastCalledWith(224);

    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(onResize).toHaveBeenLastCalledWith(304);
  });

  it("jumps to the pane's limits with Home and End", async () => {
    const user = userEvent.setup();
    const { onResize, splitter } = setup();

    splitter.focus();
    await user.keyboard("{Home}");
    expect(onResize).toHaveBeenLastCalledWith(paneConstraints.navigation.min);

    await user.keyboard("{End}");
    expect(onResize).toHaveBeenLastCalledWith(paneConstraints.navigation.max);
  });

  it("collapses the pane with Enter", async () => {
    const user = userEvent.setup();
    const { onCollapse, splitter } = setup();

    splitter.focus();
    await user.keyboard("{Enter}");

    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it("reverses arrow keys for a handle placed to the pane's left", async () => {
    const user = userEvent.setup();
    const { onResize, splitter } = setup({
      inverted: true,
      label: "Resize inspector pane",
      pane: "inspector",
      width: 280,
    });

    splitter.focus();
    await user.keyboard("{ArrowLeft}");

    expect(onResize).toHaveBeenLastCalledWith(296);
  });

  it("resets the pane on double click", async () => {
    const user = userEvent.setup();
    const { onReset, splitter } = setup();

    await user.dblClick(splitter);

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("ignores keys it does not handle", async () => {
    const user = userEvent.setup();
    const { onCollapse, onResize, splitter } = setup();

    splitter.focus();
    await user.keyboard("{ArrowUp}a");

    expect(onResize).not.toHaveBeenCalled();
    expect(onCollapse).not.toHaveBeenCalled();
  });
});
