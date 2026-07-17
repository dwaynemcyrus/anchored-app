import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";

type CloseProtectionOptions = {
  hasUnfinishedEdits: boolean;
  onCloseBlocked: () => void;
  onError: () => void;
};

export function useCloseProtection({
  hasUnfinishedEdits,
  onCloseBlocked,
  onError,
}: CloseProtectionOptions) {
  const hasUnfinishedEditsRef = useRef(hasUnfinishedEdits);
  const onCloseBlockedRef = useRef(onCloseBlocked);
  const onErrorRef = useRef(onError);
  const allowNextCloseRef = useRef(false);

  hasUnfinishedEditsRef.current = hasUnfinishedEdits;
  onCloseBlockedRef.current = onCloseBlocked;
  onErrorRef.current = onError;

  useEffect(() => {
    function protectBrowserClose(event: BeforeUnloadEvent) {
      if (!hasUnfinishedEditsRef.current || allowNextCloseRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", protectBrowserClose);
    if (!isTauri()) {
      return () =>
        window.removeEventListener("beforeunload", protectBrowserClose);
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (allowNextCloseRef.current || !hasUnfinishedEditsRef.current) return;
        event.preventDefault();
        onCloseBlockedRef.current();
      })
      .then((removeListener) => {
        if (disposed) removeListener();
        else unlisten = removeListener;
      })
      .catch(() => onErrorRef.current());

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("beforeunload", protectBrowserClose);
    };
  }, []);

  return useCallback(async () => {
    allowNextCloseRef.current = true;
    if (!isTauri()) {
      window.close();
      return;
    }
    try {
      await getCurrentWindow().close();
    } catch {
      allowNextCloseRef.current = false;
      onErrorRef.current();
    }
  }, []);
}
