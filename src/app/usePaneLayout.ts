import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  clampPaneWidth,
  collapsedForLeftStage,
  defaultPaneLayoutPreferences,
  effectivePaneWidths,
  leftPaneStage,
  loadPaneLayoutPreferences,
  maximumPaneWidth,
  paneConstraints,
  savePaneLayoutPreferences,
  type ExcerptLines,
  type LeftPaneStage,
  type PaneKey,
  type PaneLayoutPreferences,
  type PaneWidths,
} from "./paneLayout";

export type PaneLayoutApi = {
  collapsed: PaneLayoutPreferences["collapsed"];
  cycleLeftPanes: () => void;
  excerptLines: ExcerptLines;
  leftStage: LeftPaneStage;
  resizePane: (pane: PaneKey, width: number) => void;
  resetPane: (pane: PaneKey) => void;
  setExcerptLines: (lines: ExcerptLines) => void;
  stepLeftStage: (delta: number) => void;
  togglePane: (pane: PaneKey) => void;
  widths: PaneWidths;
  workspaceRef: React.RefObject<HTMLDivElement | null>;
};

function initialPreferences(): PaneLayoutPreferences {
  try {
    return loadPaneLayoutPreferences(window.localStorage);
  } catch {
    return defaultPaneLayoutPreferences;
  }
}

function persist(preferences: PaneLayoutPreferences): void {
  try {
    savePaneLayoutPreferences(window.localStorage, preferences);
  } catch {
    // Layout preferences are optional and must never block navigation.
  }
}

/// Owns the widths, collapsed flags, and note-list density of the four-pane
/// workspace, and persists them.
///
/// `widths` here are the user's *preferred* widths. Turning them into the
/// widths actually rendered needs the workspace's own width, which only the
/// DOM knows, so that step lives in the effect below and is written straight
/// to CSS custom properties rather than to React state — a drag then costs one
/// style write per frame instead of a re-render of the whole workspace, which
/// is what keeps it smooth on the 2015 MacBook Pro baseline.
export function usePaneLayout(): PaneLayoutApi {
  const [preferences, setPreferences] =
    useState<PaneLayoutPreferences>(initialPreferences);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const leftDirection = useRef(-1);
  // Mirrors the current pane flags so the cycle can read them without the
  // callback changing identity on every layout change.
  const collapsedRef = useRef(preferences.collapsed);
  collapsedRef.current = preferences.collapsed;

  const update = useCallback(
    (
      change: (
        current: PaneLayoutPreferences,
      ) => PaneLayoutPreferences | undefined,
    ) => {
      setPreferences((current) => {
        const next = change(current);
        if (!next || next === current) return current;
        persist(next);
        return next;
      });
    },
    [],
  );

  const resizePane = useCallback(
    (pane: PaneKey, width: number) => {
      update((current) => {
        const available = workspaceRef.current?.clientWidth ?? 0;
        const ceiling = available
          ? maximumPaneWidth(current, pane, available)
          : paneConstraints[pane].max;
        const next = Math.min(clampPaneWidth(pane, width), ceiling);
        if (next === current.widths[pane]) return undefined;
        return { ...current, widths: { ...current.widths, [pane]: next } };
      });
    },
    [update],
  );

  const resetPane = useCallback(
    (pane: PaneKey) => {
      update((current) => ({
        ...current,
        widths: {
          ...current.widths,
          [pane]: paneConstraints[pane].initial,
        },
      }));
    },
    [update],
  );

  const togglePane = useCallback(
    (pane: PaneKey) => {
      update((current) => ({
        ...current,
        collapsed: {
          ...current.collapsed,
          [pane]: !current.collapsed[pane],
        },
      }));
    },
    [update],
  );

  const stepLeftStage = useCallback(
    (delta: number) => {
      update((current) => {
        const collapsed = collapsedForLeftStage(
          current.collapsed,
          leftPaneStage(current.collapsed) + delta,
        );
        if (
          collapsed.navigation === current.collapsed.navigation &&
          collapsed.list === current.collapsed.list
        ) {
          return undefined;
        }
        return { ...current, collapsed };
      });
    },
    [update],
  );

  /// One button walking a three-step ladder has to remember which way it was
  /// going, or it sticks at an end: reaching stage 0 and clicking again has to
  /// mean "come back up", not "go down again". The direction flips whenever a
  /// step lands on either end, so repeated clicks run 2-1-0-1-2 and each one
  /// moves exactly one pane, matching the swipe.
  ///
  /// The bookkeeping happens here rather than inside the state updater, which
  /// has to stay pure: React invokes updaters twice in development, which
  /// would flip the direction twice and send every second click the wrong way.
  const cycleLeftPanes = useCallback(() => {
    const stage = leftPaneStage(collapsedRef.current);
    const delta = stage === 2 ? -1 : stage === 0 ? 1 : leftDirection.current;
    const next = Math.max(0, Math.min(2, stage + delta));
    leftDirection.current = next === 0 ? 1 : next === 2 ? -1 : delta;
    stepLeftStage(next - stage);
  }, [stepLeftStage]);

  const setExcerptLines = useCallback(
    (excerptLines: ExcerptLines) => {
      update((current) =>
        current.excerptLines === excerptLines
          ? undefined
          : { ...current, excerptLines },
      );
    },
    [update],
  );

  return useMemo(
    () => ({
      collapsed: preferences.collapsed,
      cycleLeftPanes,
      excerptLines: preferences.excerptLines,
      leftStage: leftPaneStage(preferences.collapsed),
      resizePane,
      resetPane,
      setExcerptLines,
      stepLeftStage,
      togglePane,
      widths: preferences.widths,
      workspaceRef,
    }),
    [
      cycleLeftPanes,
      preferences,
      resetPane,
      resizePane,
      setExcerptLines,
      stepLeftStage,
      togglePane,
    ],
  );
}

/// Writes the rendered widths to the workspace's CSS custom properties, and
/// keeps them correct as the window resizes.
export function usePaneWidthVariables(layout: PaneLayoutApi): void {
  const { collapsed, widths, workspaceRef } = layout;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const apply = () => {
      const effective = effectivePaneWidths(
        { collapsed, widths },
        workspace.clientWidth,
      );
      for (const [pane, width] of Object.entries(effective)) {
        workspace.style.setProperty(`--pane-${pane}-width`, `${width}px`);
        workspace
          .querySelector(`[data-pane="${pane}"]`)
          ?.setAttribute("data-collapsed", String(width === 0));
        // Mirrored onto the workspace so a splitter can hide itself from CSS
        // without needing to live inside the pane it resizes.
        workspace.dataset[
          `collapsed${pane.charAt(0).toUpperCase()}${pane.slice(1)}`
        ] = String(width === 0);
      }
    };

    apply();

    // ResizeObserver catches the workspace changing width for reasons the
    // window does not, such as a pane opening. Where it is missing — jsdom,
    // and any engine older than the Tauri target — the window resize event
    // still keeps the common case correct.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", apply);
      return () => window.removeEventListener("resize", apply);
    }

    const observer = new ResizeObserver(apply);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [collapsed, widths, workspaceRef]);
}
