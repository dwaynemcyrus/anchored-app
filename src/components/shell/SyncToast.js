"use client";

import { useEffect, useState } from "react";
import { addSyncListener } from "../../lib/sync/syncManager";
import styles from "./SyncToast.module.css";

const TOAST_DURATION = 3200;

export default function SyncToast() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const unsubscribe = addSyncListener((event) => {
      if (event?.type !== "conflict") return;
      setMessage("Conflict detected. Created a conflict copy.");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => {
      setMessage(null);
    }, TOAST_DURATION);
    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!message) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {message}
    </div>
  );
}
