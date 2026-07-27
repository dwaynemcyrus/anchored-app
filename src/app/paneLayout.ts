export type PaneKey = "navigation" | "list" | "inspector";
export type ExcerptLines = "one" | "two";

export type PaneWidths = Record<PaneKey, number>;
export type PaneCollapsed = Record<PaneKey, boolean>;

export type PaneLayoutPreferences = {
  collapsed: PaneCollapsed;
  excerptLines: ExcerptLines;
  widths: PaneWidths;
};

export type PaneConstraint = {
  initial: number;
  max: number;
  min: number;
};

export const paneConstraints: Record<PaneKey, PaneConstraint> = {
  navigation: { initial: 240, max: 320, min: 180 },
  list: { initial: 300, max: 480, min: 220 },
  inspector: { initial: 280, max: 420, min: 200 },
};

export const paneKeys: PaneKey[] = ["navigation", "list", "inspector"];

/// The editor never renders narrower than this. When the window cannot honour
/// it, side panes give way from the outside in.
export const editorMinWidth = 400;

/// Order in which panes surrender space: the inspector is furthest from the
/// writing, then navigation, and the note list gives way last because it is
/// what the editor is usually read against.
const sacrificeOrder: PaneKey[] = ["inspector", "navigation", "list"];

const STORAGE_KEY = "anchored.pane-layout.v1";
const STORAGE_VERSION = 1;

export const defaultPaneLayoutPreferences: PaneLayoutPreferences = {
  collapsed: { navigation: false, list: false, inspector: false },
  excerptLines: "two",
  widths: {
    navigation: paneConstraints.navigation.initial,
    list: paneConstraints.list.initial,
    inspector: paneConstraints.inspector.initial,
  },
};

export function clampPaneWidth(pane: PaneKey, width: number): number {
  const { max, min } = paneConstraints[pane];
  return Math.round(Math.min(max, Math.max(min, width)));
}

function readWidth(pane: PaneKey, value: unknown): number {
  const width = Number(value);
  return Number.isFinite(width)
    ? clampPaneWidth(pane, width)
    : paneConstraints[pane].initial;
}

export function loadPaneLayoutPreferences(
  storage: Pick<Storage, "getItem">,
): PaneLayoutPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultPaneLayoutPreferences;
    const value = JSON.parse(raw) as Partial<PaneLayoutPreferences> & {
      version?: number;
    };
    if (value.version !== STORAGE_VERSION) return defaultPaneLayoutPreferences;

    const collapsed = {} as PaneCollapsed;
    const widths = {} as PaneWidths;
    for (const pane of paneKeys) {
      collapsed[pane] = Boolean(value.collapsed?.[pane]);
      widths[pane] = readWidth(pane, value.widths?.[pane]);
    }

    return {
      collapsed,
      excerptLines: value.excerptLines === "one" ? "one" : "two",
      widths,
    };
  } catch {
    return defaultPaneLayoutPreferences;
  }
}

export function savePaneLayoutPreferences(
  storage: Pick<Storage, "setItem">,
  preferences: PaneLayoutPreferences,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...preferences, version: STORAGE_VERSION }),
    );
  } catch {
    // Layout preferences are optional and must never block navigation.
  }
}

/// Derives the widths actually rendered from the preferred widths plus the
/// space available. Preferred widths are never rewritten by a narrow window:
/// squeezing is a rendering decision, so the chosen widths return intact once
/// the window has room again.
export function effectivePaneWidths(
  preferences: Pick<PaneLayoutPreferences, "collapsed" | "widths">,
  availableWidth: number,
): PaneWidths {
  const effective = {} as PaneWidths;
  for (const pane of paneKeys) {
    effective[pane] = preferences.collapsed[pane]
      ? 0
      : preferences.widths[pane];
  }

  const overflow = () =>
    paneKeys.reduce((total, pane) => total + effective[pane], 0) +
    editorMinWidth -
    availableWidth;

  for (const pane of sacrificeOrder) {
    const over = overflow();
    if (over <= 0) break;
    if (effective[pane] === 0) continue;
    effective[pane] -= Math.min(
      over,
      effective[pane] - paneConstraints[pane].min,
    );
  }

  // Still short: close panes outright. This is derived rather than stored, so
  // a pane closed by a narrow window reopens on its own once there is room.
  for (const pane of sacrificeOrder) {
    if (overflow() <= 0) break;
    effective[pane] = 0;
  }

  return effective;
}

/// The widest the pane may be dragged before the editor would hit its floor.
export function maximumPaneWidth(
  preferences: Pick<PaneLayoutPreferences, "collapsed" | "widths">,
  pane: PaneKey,
  availableWidth: number,
): number {
  const others = paneKeys
    .filter((other) => other !== pane && !preferences.collapsed[other])
    .reduce((total, other) => total + preferences.widths[other], 0);
  const room = availableWidth - others - editorMinWidth;
  return Math.max(
    paneConstraints[pane].min,
    Math.min(paneConstraints[pane].max, room),
  );
}

export type LeftPaneStage = 0 | 1 | 2;

/// The two left panes open and close as one three-step ladder:
///
///   2  navigation + list
///   1  list only
///   0  neither
///
/// The stage is read back from the panes rather than stored, so the gesture,
/// the button, and the individual pane shortcuts can never disagree. Either
/// single-pane arrangement counts as stage 1, so a step from an off-ladder
/// state always resolves onto the ladder.
export function leftPaneStage(collapsed: PaneCollapsed): LeftPaneStage {
  const open = (collapsed.navigation ? 0 : 1) + (collapsed.list ? 0 : 1);
  return open as LeftPaneStage;
}

export function collapsedForLeftStage(
  collapsed: PaneCollapsed,
  stage: number,
): PaneCollapsed {
  const next = Math.max(0, Math.min(2, stage));
  return {
    ...collapsed,
    list: next < 1,
    navigation: next < 2,
  };
}
