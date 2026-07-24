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
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
};

/// Owns the narrow-layout sidebar open/closed flag and the set of expanded
/// physical folder paths. `setExpandedFolders` is exposed directly (like
/// `setTrashVisible` in useTrashPanel) because many unrelated vault
/// mutation handlers in App.tsx (rename, move, delete, rescan) need to
/// update it as a side effect of their own logic, not as a sidebar action.
/// The returned object is memoized because those same App.tsx handlers are
/// themselves memoized callbacks that list `sidebar` as a dependency; an
/// unmemoized object would recreate them (and anything depending on them,
/// including effects) on every render.
export function useSidebarState(): SidebarStateApi {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((isOpen) => !isOpen);
  }, []);

  const reset = useCallback(() => {
    setSidebarOpen(false);
    setExpandedFolders(new Set());
  }, []);

  return useMemo(
    () => ({
      expandedFolders,
      reset,
      setExpandedFolders,
      setSidebarOpen,
      sidebarOpen,
      toggleSidebar,
    }),
    [expandedFolders, reset, setExpandedFolders, sidebarOpen, toggleSidebar],
  );
}
