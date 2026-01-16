"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const title = routes[pathname] ?? "";
  const isHome = pathname === "/";

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        {isHome ? (
          <button
            type="button"
            className={`${styles.headerButton} ${styles.headerButtonPlaceholder}`}
            aria-label="Open menu"
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
        <div className={styles.headerTitle}>{title}</div>
        <div className={styles.headerButton} aria-hidden="true" />
      </header>
      {children}
      <div className={styles.fabContainer}>
        <button type="button" className={styles.fab} aria-label="Quick capture">
          +
        </button>
      </div>
    </div>
  );
}
