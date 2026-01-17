"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import QuickCaptureModal from "./QuickCaptureModal";
import { useShellHeaderStore } from "../../store/shellHeaderStore";
import styles from "./Shell.module.css";

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

export default function Shell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const title = routes[pathname] ?? "";
  const overrideTitle = useShellHeaderStore((state) => state.title);
  const headerStatus = useShellHeaderStore((state) => state.status);
  const headerTitle = overrideTitle ?? title;
  const isHome = pathname === "/";
  const [captureOpen, setCaptureOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [captureValue, setCaptureValue] = useState("");
  const [captureShouldFocus, setCaptureShouldFocus] = useState(false);
  const [rapidEnabled, setRapidEnabled] = useState(false);
  const capturesRef = useRef([]);
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
      { href: "/knowledge", label: "Knowledge" },
      { href: "/knowledge/notes", label: "Notes (v0)" },
      { href: "/strategy", label: "Strategy" },
    ],
    []
  );

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

  const handleOpenCapture = () => {
    resetDragState();
    clearLongPressTimer();
    setCaptureShouldFocus(true);
    setCaptureOpen(true);
  };

  const handleCloseCapture = () => {
    resetDragState();
    setCaptureOpen(false);
    setCaptureValue("");
    setCaptureShouldFocus(false);
  };

  const handleSaveCapture = () => {
    const trimmed = captureValue.trim();
    if (!trimmed) return;
    capturesRef.current = [...capturesRef.current, trimmed];
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

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const resetDragState = () => {
    clearLongPressTimer();
    setDragActive(false);
    setActiveTarget(null);
    dragPointerIdRef.current = null;
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

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
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
              href="/"
              className={styles.headerButton}
              aria-label="Back to home"
            >
              <BackIcon />
            </Link>
          )}
          <div className={styles.headerTitle}>{headerTitle}</div>
        </div>
        <div className={styles.headerActions}>
          {headerStatus ? (
            <div className={styles.headerStatus}>{headerStatus}</div>
          ) : null}
          <div className={styles.headerButton} aria-hidden="true" />
        </div>
      </header>
      {children}
      <div className={styles.fabContainer}>
        <button
          type="button"
          className={`${styles.fab} ${dragActive ? styles.fabDragging : ""} ${
            captureOpen ? styles.fabHidden : ""
          }`}
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
