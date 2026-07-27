import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type SidebarStateApi = {
  expandedFolders: Set<string>;
  reset: () => void;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
};

/// Owns the set of expanded physical folder paths in the navigation pane.
///
/// `setExpandedFolders` is exposed directly (like `setTrashVisible` in
/// useTrashPanel) because many unrelated vault mutation handlers in App.tsx
/// (rename, move, delete, rescan) need to update it as a side effect of their
/// own logic, not as a navigation action. The returned object is memoized
/// because those same App.tsx handlers are themselves memoized callbacks that
/// list `sidebar` as a dependency; an unmemoized object would recreate them
/// (and anything depending on them, including effects) on every render.
///
/// This previously also owned a `sidebarOpen` flag for the narrow-layout
/// drawer. The four-pane workspace collapses panes through `usePaneLayout`
/// instead, so that flag went with the drawer.
export function useSidebarState(): SidebarStateApi {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  const reset = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  return useMemo(
    () => ({
      expandedFolders,
      reset,
      setExpandedFolders,
    }),
    [expandedFolders, reset, setExpandedFolders],
  );
}
