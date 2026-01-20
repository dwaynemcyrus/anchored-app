"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QuickCaptureModal from "./QuickCaptureModal";
import { useShellHeaderStore } from "../../store/shellHeaderStore";
import { useEditorSettingsStore } from "../../store/editorSettingsStore";
import { useNotesStore } from "../../store/notesStore";
import styles from "./Shell.module.css";
import layout from "./AppShell.module.css";
import useVisualViewportInsets from "../../hooks/useVisualViewportInsets";

const routes = {
  "/": "Home",
  "/command": "Command",
  "/knowledge": "Knowledge",
  "/strategy": "Strategy",
};

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.icon}
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.icon}
    >
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FocusModeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.icon}
    >
      <path
        d="M5 7h14M5 12h9M5 17h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function TextSizeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.icon}
    >
      <path
        d="M6 17l3-10h2l3 10M8 13h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16 17l1.5-5h1.5l1.5 5M16.5 15h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default function Shell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const title = routes[pathname] ?? "";
  const overrideTitle = useShellHeaderStore((state) => state.title);
  const headerStatus = useShellHeaderStore((state) => state.status);
  const headerTitle = overrideTitle ?? title;
  const hydrateEditorSettings = useEditorSettingsStore((state) => state.hydrate);
  const focusMode = useEditorSettingsStore((state) => state.focusMode);
  const fontSize = useEditorSettingsStore((state) => state.fontSize);
  const toggleFocusMode = useEditorSettingsStore((state) => state.toggleFocusMode);
  const cycleFontSize = useEditorSettingsStore((state) => state.cycleFontSize);
  const createNote = useNotesStore((state) => state.createNote);
  const isHome = pathname === "/";
  const isNoteEditorRoute =
    typeof pathname === "string" &&
    pathname.startsWith("/knowledge/notes/") &&
    pathname !== "/knowledge/notes";

  // Determine back link based on current route
  const backHref = isNoteEditorRoute ? "/knowledge/notes" : "/";
  const [captureOpen, setCaptureOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [captureValue, setCaptureValue] = useState("");
  const [captureShouldFocus, setCaptureShouldFocus] = useState(false);
  const [rapidEnabled, setRapidEnabled] = useState(false);
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeTarget, setActiveTarget] = useState(null);
  const longPressTimerRef = useRef(null);
  const dragPointerIdRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const fabRef = useRef(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const shellRootRef = useRef(null);
  const contentScrollerRef = useRef(null);

  const targets = useMemo(
    () => [
      { id: "command", label: "Command", href: "/command", offset: [-96, 0] },
      { id: "knowledge", label: "Knowledge", href: "/knowledge", offset: [96, 0] },
      { id: "strategy", label: "Strategy", href: "/strategy", offset: [0, -96] },
    ],
    []
  );

  const menuLinks = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/command", label: "Command" },
      { href: "/inbox", label: "Inbox" },
      { href: "/knowledge", label: "Knowledge" },
      { href: "/knowledge/notes", label: "Notes (v0)" },
      { href: "/strategy", label: "Strategy" },
      { href: "/settings", label: "Settings" },
    ],
    []
  );

  useEffect(() => {
    hydrateEditorSettings();
  }, [hydrateEditorSettings]);

  useVisualViewportInsets(shellRootRef, contentScrollerRef);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [menuOpen]);

  useEffect(() => {
    if (!captureOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlHeight = document.documentElement.style.height;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.height = "100%";

    return () => {
      const offset = parseInt(document.body.style.top || "0", 10) * -1;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.height = previousHtmlHeight;
      window.scrollTo(0, Number.isNaN(offset) ? scrollY : offset);
    };
  }, [captureOpen]);

  useEffect(() => {
    if (!dragActive) return;
    const previousTouchAction = document.body.style.touchAction;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.touchAction = "none";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.touchAction = previousTouchAction;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragActive]);

  const touchEnabled =
    typeof window !== "undefined" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetDragState = useCallback(() => {
    clearLongPressTimer();
    setDragActive(false);
    setActiveTarget(null);
    dragPointerIdRef.current = null;
  }, [clearLongPressTimer]);

  const handleOpenCapture = useCallback(() => {
    resetDragState();
    clearLongPressTimer();
    setCaptureShouldFocus(true);
    setCaptureOpen(true);
  }, [clearLongPressTimer, resetDragState]);

  useEffect(() => {
    const handleSearchShortcut = (event) => {
      const isK = event.key === "k" || event.key === "K";
      if (!isK || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      handleOpenCapture();
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [handleOpenCapture]);

  const handleCloseCapture = () => {
    resetDragState();
    setCaptureOpen(false);
    setCaptureValue("");
    setCaptureShouldFocus(false);
  };

  const handleSaveCapture = async () => {
    const trimmed = captureValue.trim();
    const body = trimmed ? `${trimmed}\n\n` : "\n";
    const now = Date.now();
    await createNote({ body, title: null, inboxAt: now });
    if (rapidEnabled) {
      setCaptureValue("");
      setCaptureShouldFocus(true);
      return;
    }
    handleCloseCapture();
  };

  const handleBackdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    if (captureValue.trim().length === 0) {
      handleCloseCapture();
    }
  };

  const activateDrag = () => {
    if (captureOpen) return;
    if (!fabRef.current) return;
    const rect = fabRef.current.getBoundingClientRect();
    const origin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    setDragOrigin(origin);
    setDragPosition({ x: pointerStartRef.current.x, y: pointerStartRef.current.y });
    setDragActive(true);
    longPressTriggeredRef.current = true;
  };

  const handleFabPointerDown = (event) => {
    if (captureOpen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    longPressTriggeredRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    dragPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    longPressTimerRef.current = window.setTimeout(() => {
      activateDrag();
    }, 300);
  };

  const handleFabPointerMove = (event) => {
    if (!dragActive) {
      if (!longPressTimerRef.current) return;
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      const rect = event.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      return;
    }
    if (!dragActive) return;
    event.preventDefault();
    setDragPosition({ x: event.clientX, y: event.clientY });
    const hitTarget = targets.find((target) => {
      const [offsetX, offsetY] = target.offset;
      const centerX = dragOrigin.x + offsetX;
      const centerY = dragOrigin.y + offsetY;
      const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      return distance < 48;
    });
    setActiveTarget(hitTarget?.id ?? null);
  };

  const handleFabPointerUp = () => {
    if (dragActive && activeTarget) {
      const target = targets.find((item) => item.id === activeTarget);
      if (target) router.push(target.href);
    }
    resetDragState();
  };

  const handleFabPointerCancel = () => {
    resetDragState();
  };

  const handleFabClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    clearLongPressTimer();
    handleOpenCapture();
  };

  const handleMenuToggle = () => {
    if (captureOpen) return;
    setMenuOpen((prev) => !prev);
  };

  const handleMenuBackdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    setMenuOpen(false);
  };

  const handleTouchStart = (event) => {
    if (captureOpen) return;
    const touch = event.touches[0];
    if (!touch) return;
    longPressTriggeredRef.current = false;
    pointerStartRef.current = { x: touch.clientX, y: touch.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    });
    longPressTimerRef.current = window.setTimeout(() => {
      activateDrag();
    }, 300);
  };

  const handleTouchMove = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (!dragActive) {
      if (!longPressTimerRef.current) return;
      pointerStartRef.current = { x: touch.clientX, y: touch.clientY };
      const rect = event.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      });
      return;
    }
    setDragPosition({ x: touch.clientX, y: touch.clientY });
    const hitTarget = targets.find((target) => {
      const [offsetX, offsetY] = target.offset;
      const centerX = dragOrigin.x + offsetX;
      const centerY = dragOrigin.y + offsetY;
      const distance = Math.hypot(touch.clientX - centerX, touch.clientY - centerY);
      return distance < 48;
    });
    setActiveTarget(hitTarget?.id ?? null);
  };

  const handleTouchEnd = () => {
    handleFabPointerUp();
  };

  const touchHandlers = touchEnabled
    ? {
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
      }
    : {};

  const preventPointerFocus = (event) => {
    event.preventDefault();
  };

  return (
    <div className={layout.shell} data-shell-root ref={shellRootRef}>
      <div className={layout.contentViewport} data-content-viewport>
        <main
          className={layout.contentScroller}
          data-content-scroller
          ref={contentScrollerRef}
        >
          {children}
        </main>
      </div>
      <div className={layout.overlayLayer} data-overlay-layer aria-hidden="false">
        <header className={`${layout.shellHeader} ${styles.header}`}>
          <div className={styles.headerLeft}>
            {isHome ? (
              <button
                type="button"
                className={styles.headerButton}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                onClick={handleMenuToggle}
              >
                <MenuIcon />
              </button>
            ) : (
              <Link
                href={backHref}
                className={styles.headerButton}
                aria-label={isNoteEditorRoute ? "Back to notes" : "Back to home"}
              >
                <BackIcon />
              </Link>
            )}
            <div className={styles.headerTitle}>{headerTitle}</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.headerActionsTop}>
              {headerStatus ? (
                <div className={styles.headerStatus}>{headerStatus}</div>
              ) : null}
              {isNoteEditorRoute ? (
                <button
                  type="button"
                  className={styles.headerButton}
                  aria-label={`Font size: ${fontSize}`}
                  onPointerDown={preventPointerFocus}
                  onClick={cycleFontSize}
                >
                  <TextSizeIcon />
                </button>
              ) : (
                <div className={styles.headerButton} aria-hidden="true" />
              )}
            </div>
            {isNoteEditorRoute ? (
              <div className={styles.headerActionsBottom}>
                <button
                  type="button"
                  className={`${styles.headerButton} ${
                    focusMode ? styles.headerButtonActive : ""
                  }`}
                  aria-label="Toggle focus mode"
                  aria-pressed={focusMode}
                  onPointerDown={preventPointerFocus}
                  onClick={toggleFocusMode}
                >
                  <FocusModeIcon />
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <button
          type="button"
          className={`${layout.fab} ${styles.fab} ${
            dragActive ? styles.fabDragging : ""
          } ${captureOpen ? styles.fabHidden : ""}`}
          aria-label="Quick capture"
          ref={fabRef}
          onClick={handleFabClick}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={handleFabPointerDown}
          onPointerMove={handleFabPointerMove}
          onPointerUp={handleFabPointerUp}
          onPointerCancel={handleFabPointerCancel}
          {...touchHandlers}
          disabled={captureOpen}
          style={
            dragActive
              ? {
                  left: `${dragPosition.x - dragOffset.x}px`,
                  top: `${dragPosition.y - dragOffset.y}px`,
                  transform: "none",
                }
              : undefined
          }
        >
          +
        </button>
      </div>
      {dragActive && !captureOpen ? (
        <div className={styles.targetsLayer} aria-hidden="true">
          {targets.map((target) => {
            const [offsetX, offsetY] = target.offset;
            return (
              <div
                key={target.id}
                className={`${styles.target} ${
                  activeTarget === target.id ? styles.targetActive : ""
                }`}
                style={{
                  left: `${dragOrigin.x + offsetX}px`,
                  top: `${dragOrigin.y + offsetY}px`,
                }}
              >
                {target.label}
              </div>
            );
          })}
        </div>
      ) : null}
      <QuickCaptureModal
        isOpen={captureOpen}
        value={captureValue}
        inputRef={inputRef}
        shouldFocus={captureShouldFocus}
        onFocused={() => setCaptureShouldFocus(false)}
        rapidEnabled={rapidEnabled}
        onToggleRapid={() => {
          setRapidEnabled((prev) => !prev);
          setCaptureShouldFocus(true);
        }}
        onChange={setCaptureValue}
        onSave={handleSaveCapture}
        onCancel={handleCloseCapture}
        onBackdrop={handleBackdrop}
      />
      {menuOpen ? (
        <div className={styles.menuOverlay} onClick={handleMenuBackdrop}>
          <nav className={styles.menuPanel} aria-label="Primary">
            <div className={styles.menuTitle}>Navigate</div>
            <div className={styles.menuLinks}>
              {menuLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={styles.menuLink}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
