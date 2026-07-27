import { describe, expect, it, vi } from "vitest";

import {
  clampPaneWidth,
  collapsedForLeftStage,
  defaultPaneLayoutPreferences,
  editorMinWidth,
  effectivePaneWidths,
  leftPaneStage,
  loadPaneLayoutPreferences,
  maximumPaneWidth,
  paneConstraints,
  savePaneLayoutPreferences,
  type PaneCollapsed,
} from "./paneLayout";

const allOpen: PaneCollapsed = {
  navigation: false,
  list: false,
  inspector: false,
};

function preferences(overrides: Partial<PaneCollapsed> = {}) {
  return {
    collapsed: { ...allOpen, ...overrides },
    widths: defaultPaneLayoutPreferences.widths,
  };
}

describe("pane layout preferences", () => {
  it("defaults when storage is empty", () => {
    expect(loadPaneLayoutPreferences({ getItem: () => null })).toEqual(
      defaultPaneLayoutPreferences,
    );
  });

  it("round-trips widths, collapsed panes, and excerpt lines", () => {
    const setItem = vi.fn();
    savePaneLayoutPreferences(
      { setItem },
      {
        collapsed: { navigation: true, list: false, inspector: true },
        excerptLines: "one",
        widths: { navigation: 200, list: 340, inspector: 260 },
      },
    );
    const persisted = setItem.mock.calls[0]?.[1] as string;

    expect(loadPaneLayoutPreferences({ getItem: () => persisted })).toEqual({
      collapsed: { navigation: true, list: false, inspector: true },
      excerptLines: "one",
      widths: { navigation: 200, list: 340, inspector: 260 },
    });
  });

  it("clamps persisted widths that fall outside their constraints", () => {
    const stored = JSON.stringify({
      collapsed: allOpen,
      excerptLines: "two",
      version: 1,
      widths: { navigation: 5000, list: 1, inspector: 280 },
    });

    const loaded = loadPaneLayoutPreferences({ getItem: () => stored });

    expect(loaded.widths.navigation).toBe(paneConstraints.navigation.max);
    expect(loaded.widths.list).toBe(paneConstraints.list.min);
  });

  it("falls back safely for malformed storage and unknown versions", () => {
    expect(loadPaneLayoutPreferences({ getItem: () => "{" })).toEqual(
      defaultPaneLayoutPreferences,
    );
    expect(
      loadPaneLayoutPreferences({
        getItem: () => JSON.stringify({ version: 99, widths: {} }),
      }),
    ).toEqual(defaultPaneLayoutPreferences);
  });

  it("never throws when storage rejects writes", () => {
    expect(() =>
      savePaneLayoutPreferences(
        {
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
        defaultPaneLayoutPreferences,
      ),
    ).not.toThrow();
  });

  it("clamps widths to each pane's constraints", () => {
    expect(clampPaneWidth("navigation", 10)).toBe(
      paneConstraints.navigation.min,
    );
    expect(clampPaneWidth("list", 9000)).toBe(paneConstraints.list.max);
    expect(clampPaneWidth("inspector", 260.4)).toBe(260);
  });
});

describe("effective pane widths", () => {
  it("renders preferred widths when there is room", () => {
    expect(effectivePaneWidths(preferences(), 1600)).toEqual(
      defaultPaneLayoutPreferences.widths,
    );
  });

  it("reports a collapsed pane as zero width", () => {
    expect(
      effectivePaneWidths(preferences({ inspector: true }), 1600).inspector,
    ).toBe(0);
  });

  it("shrinks panes toward their minimums before closing any", () => {
    const widths = effectivePaneWidths(preferences(), 1000);

    expect(widths.navigation).toBe(paneConstraints.navigation.min);
    expect(widths.list).toBe(paneConstraints.list.min);
    expect(widths.inspector).toBe(paneConstraints.inspector.min);
  });

  it("closes panes from the outside in once shrinking is not enough", () => {
    expect(effectivePaneWidths(preferences(), 900).inspector).toBe(0);

    const veryNarrow = effectivePaneWidths(preferences(), 700);
    expect(veryNarrow.inspector).toBe(0);
    expect(veryNarrow.navigation).toBe(0);
    expect(veryNarrow.list).toBeGreaterThan(0);
  });

  it("keeps the editor at or above its floor wherever possible", () => {
    for (const available of [1600, 1280, 1100, 1000, 900, 800, 700]) {
      const widths = effectivePaneWidths(preferences(), available);
      const used = widths.navigation + widths.list + widths.inspector;
      expect(available - used).toBeGreaterThanOrEqual(editorMinWidth);
    }
  });

  it("leaves the preferred widths untouched when squeezing", () => {
    const chosen = preferences();
    effectivePaneWidths(chosen, 700);
    expect(chosen.widths).toEqual(defaultPaneLayoutPreferences.widths);
  });
});

describe("maximum pane width", () => {
  it("stops a drag before the editor reaches its floor", () => {
    // 1230 leaves 250px once the other panes and the editor floor are taken.
    expect(maximumPaneWidth(preferences(), "navigation", 1230)).toBe(
      1230 - 300 - 280 - editorMinWidth,
    );
  });

  it("never returns less than the pane's own minimum", () => {
    // At 1100 the room left is 120px, below navigation's 180px minimum. The
    // pane keeps its minimum and the editor gives way instead.
    expect(maximumPaneWidth(preferences(), "navigation", 1100)).toBe(
      paneConstraints.navigation.min,
    );
  });

  it("never exceeds the pane's own maximum", () => {
    expect(maximumPaneWidth(preferences(), "navigation", 4000)).toBe(
      paneConstraints.navigation.max,
    );
  });

  it("ignores collapsed panes when measuring the room available", () => {
    const withoutInspector = maximumPaneWidth(
      preferences({ inspector: true }),
      "navigation",
      1100,
    );
    expect(withoutInspector).toBeGreaterThan(
      maximumPaneWidth(preferences(), "navigation", 1100),
    );
  });
});

describe("left pane ladder", () => {
  it("counts the open left panes", () => {
    expect(leftPaneStage(allOpen)).toBe(2);
    expect(leftPaneStage({ ...allOpen, navigation: true })).toBe(1);
    expect(leftPaneStage({ ...allOpen, navigation: true, list: true })).toBe(0);
  });

  it("treats either single open left pane as stage 1", () => {
    expect(leftPaneStage({ ...allOpen, list: true })).toBe(1);
  });

  it("closes navigation first and reopens the list first", () => {
    const both = allOpen;
    const one = collapsedForLeftStage(both, leftPaneStage(both) - 1);
    expect(one).toMatchObject({ navigation: true, list: false });

    const none = collapsedForLeftStage(one, leftPaneStage(one) - 1);
    expect(none).toMatchObject({ navigation: true, list: true });

    const listBack = collapsedForLeftStage(none, leftPaneStage(none) + 1);
    expect(listBack).toMatchObject({ navigation: true, list: false });

    const bothBack = collapsedForLeftStage(
      listBack,
      leftPaneStage(listBack) + 1,
    );
    expect(bothBack).toMatchObject({ navigation: false, list: false });
  });

  it("clamps beyond either end of the ladder", () => {
    expect(collapsedForLeftStage(allOpen, 5)).toMatchObject({
      navigation: false,
      list: false,
    });
    expect(collapsedForLeftStage(allOpen, -3)).toMatchObject({
      navigation: true,
      list: true,
    });
  });

  it("resolves an off-ladder arrangement onto the ladder", () => {
    const navOnly: PaneCollapsed = { ...allOpen, list: true };
    expect(
      collapsedForLeftStage(navOnly, leftPaneStage(navOnly) + 1),
    ).toMatchObject({ navigation: false, list: false });
  });

  it("leaves the inspector alone", () => {
    expect(
      collapsedForLeftStage({ ...allOpen, inspector: true }, 0).inspector,
    ).toBe(true);
  });
});
