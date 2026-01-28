"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetAllBuiltInTemplates } from "../../lib/templates";
import { getQueueStats } from "../../lib/sync/syncQueue";
import { performInitialSync, resetLastSyncTime } from "../../lib/sync/initialSync";
import { processSyncQueue } from "../../lib/sync/syncManager";
import { useSyncStore } from "../../store/syncStore";
import { peekClientId } from "../../lib/clientId";
import { getUserId } from "../../lib/supabase/client";
import styles from "../../styles/settings.module.css";

export default function SettingsPage() {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);
  const syncStatus = useSyncStore((state) => state.status);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const lastError = useSyncStore((state) => state.lastError);
  const lastErrorDetails = useSyncStore((state) => state.lastErrorDetails);
  const lastErrorAt = useSyncStore((state) => state.lastErrorAt);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const lastSuccessfulSyncAt = useSyncStore((state) => state.lastSuccessfulSyncAt);
  const lastSuccessDisplay = lastSuccessfulSyncAt ?? lastSyncedAt;
  const [queueStats, setQueueStats] = useState({ count: 0, retryCount: 0, maxRetry: 0 });
  const [userId, setUserId] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [syncActionMessage, setSyncActionMessage] = useState(null);
  const [syncActionBusy, setSyncActionBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const loadQueueStats = async () => {
      try {
        const stats = await getQueueStats();
        if (active) setQueueStats(stats);
      } catch (error) {
        console.error("Failed to load sync queue stats", error);
      }
    };
    loadQueueStats();
    return () => {
      active = false;
    };
  }, [pendingCount]);

  useEffect(() => {
    let active = true;
    const loadIdentifiers = async () => {
      try {
        const clientValue = peekClientId();
        const userValue = await getUserId();
        if (!active) return;
        setClientId(clientValue);
        setUserId(userValue);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load sync identifiers", error);
      }
    };
    loadIdentifiers();
    return () => {
      active = false;
    };
  }, []);

  const formatTimestamp = (value) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  };

  const formatErrorDetails = (details) => {
    if (!details) return "None";
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  };

  const handleSyncNow = async () => {
    if (syncActionBusy) return;
    setSyncActionBusy(true);
    setSyncActionMessage(null);
    try {
      await processSyncQueue();
      await performInitialSync();
      setSyncActionMessage("Sync completed.");
      setTimeout(() => setSyncActionMessage(null), 3000);
    } catch (error) {
      console.error("Sync now failed", error);
      setSyncActionMessage("Sync failed. Check console for details.");
    } finally {
      setSyncActionBusy(false);
    }
  };

  const handleResetSync = async () => {
    if (syncActionBusy) return;
    const confirmed = window.confirm(
      "Reset last sync time and re-sync everything on next run?"
    );
    if (!confirmed) return;
    setSyncActionBusy(true);
    setSyncActionMessage(null);
    try {
      await resetLastSyncTime();
      setSyncActionMessage("Last sync reset. Trigger a sync now.");
      setTimeout(() => setSyncActionMessage(null), 3000);
    } catch (error) {
      console.error("Failed to reset sync time", error);
      setSyncActionMessage("Failed to reset sync time.");
    } finally {
      setSyncActionBusy(false);
    }
  };

  const handleResetTemplates = async () => {
    if (isResetting) return;

    const confirmed = window.confirm(
      "Reset all templates to their defaults? Your customizations will be lost."
    );
    if (!confirmed) return;

    setIsResetting(true);
    setResetMessage(null);

    try {
      await resetAllBuiltInTemplates();
      setResetMessage("Templates reset successfully");
      setTimeout(() => setResetMessage(null), 3000);
    } catch (error) {
      console.error("Failed to reset templates:", error);
      setResetMessage("Failed to reset templates");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.backButton}
            onClick={() => router.back()}
            aria-label="Go back"
          >
            &larr;
          </button>
          <h1 className={styles.title}>Settings</h1>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Data</h2>
          <div className={styles.card}>
            <Link href="/settings/data" className={styles.cardItemLink}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Backup & Restore</span>
                <span className={styles.cardItemDescription}>
                  Export and import your notes
                </span>
              </div>
              <span className={styles.cardItemArrow}>&rarr;</span>
            </Link>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Templates</h2>
          <div className={styles.card}>
            <Link href="/settings/templates" className={styles.cardItemLink}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Manage Templates</span>
                <span className={styles.cardItemDescription}>
                  View, create, and edit templates
                </span>
              </div>
              <span className={styles.cardItemArrow}>&rarr;</span>
            </Link>
            <button
              type="button"
              className={styles.cardItemButton}
              onClick={handleResetTemplates}
              disabled={isResetting}
            >
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>
                  {isResetting ? "Resetting..." : "Reset All Templates"}
                </span>
                <span className={styles.cardItemDescription}>
                  Restore built-in templates to their defaults
                </span>
              </div>
            </button>
          </div>
          {resetMessage && (
            <p className={styles.message}>{resetMessage}</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Sync Integrity</h2>
          <div className={styles.card}>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Status</span>
                <span className={styles.cardItemDescription}>{syncStatus}</span>
              </div>
              <span className={styles.cardItemArrow}>
                {pendingCount > 0 ? `${pendingCount} pending` : "0 pending"}
              </span>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Queue Count</span>
                <span className={styles.cardItemDescription}>
                  Local sync queue size
                </span>
              </div>
              <span className={styles.cardItemArrow}>{queueStats.count}</span>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Last Successful Sync</span>
                <span className={styles.cardItemDescription}>
                  {formatTimestamp(lastSuccessDisplay)}
                </span>
              </div>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Last Pull (Synced At)</span>
                <span className={styles.cardItemDescription}>
                  {formatTimestamp(lastSyncedAt)}
                </span>
              </div>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Last Error</span>
                <span className={styles.cardItemDescription}>
                  {lastError || "None"}
                </span>
              </div>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Last Error At</span>
                <span className={styles.cardItemDescription}>
                  {formatTimestamp(lastErrorAt)}
                </span>
              </div>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Retry Attempts</span>
                <span className={styles.cardItemDescription}>
                  Items with retries: {queueStats.retryCount}
                </span>
              </div>
              <span className={styles.cardItemArrow}>
                {queueStats.maxRetry ? `Max ${queueStats.maxRetry}` : "0"}
              </span>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Last Error Details</span>
                <span className={styles.cardItemDescription}>
                  {lastErrorDetails ? "Expanded below" : "None"}
                </span>
              </div>
            </div>
            {lastErrorDetails ? (
              <div className={styles.cardItemFull}>
                <pre className={styles.preformatted}>
                  {formatErrorDetails(lastErrorDetails)}
                </pre>
              </div>
            ) : null}
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>User ID</span>
                <span className={styles.cardItemDescription}>
                  {userId || "Unknown"}
                </span>
              </div>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Client ID</span>
                <span className={styles.cardItemDescription}>
                  {clientId || "Unknown"}
                </span>
              </div>
            </div>
            <div className={styles.cardItemActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleSyncNow}
                disabled={syncActionBusy}
              >
                {syncActionBusy ? "Syncing..." : "Sync Now"}
              </button>
              <button
                type="button"
                className={styles.actionButtonSmallDanger}
                onClick={handleResetSync}
                disabled={syncActionBusy}
              >
                Reset Last Sync
              </button>
            </div>
          </div>
        </section>
      </main>
      {syncActionMessage ? (
        <div
          className={`${styles.toast} ${syncActionMessage.toLowerCase().includes("failed") ? styles.toastError : ""}`}
          role="status"
        >
          {syncActionMessage}
        </div>
      ) : null}
    </div>
  );
}
