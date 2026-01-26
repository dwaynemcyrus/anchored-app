"use client";

import styles from "./page.module.css";

function redact(value) {
  if (!value) return "(missing)";
  const tail = value.slice(-6);
  return `…${tail}`;
}

export default function EnvDebugPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const host = typeof window !== "undefined" ? window.location.host : "";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Env Debug</h1>
        <div className={styles.row}>
          <span className={styles.label}>Host</span>
          <span>{host || "(unknown)"}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>NEXT_PUBLIC_SUPABASE_URL</span>
          <span>{redact(url)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
          <span>{redact(anon)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Missing URL</span>
          <span>{url ? "no" : "yes"}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Missing Anon Key</span>
          <span>{anon ? "no" : "yes"}</span>
        </div>
      </div>
    </div>
  );
}
