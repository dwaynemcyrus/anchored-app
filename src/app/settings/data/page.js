"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../styles/settings.module.css";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { useDocumentsStore } from "@/store/documentsStore";
import {
  exportBackupJson,
  exportMarkdownBundle,
  downloadBlob,
  getBackupJsonFilename,
  getMarkdownBundleFilename,
} from "@/lib/backup/exporter";

export default function DataPage() {
  const router = useRouter();
  const [exporting, setExporting] = useState(null);
  const [toast, setToast] = useState(null);
  const resetLocalCache = useDocumentsStore((state) => state.resetLocalCache);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleExportJson = async () => {
    if (exporting) return;
    setExporting("json");
    try {
      const repo = getDocumentsRepo();
      const backup = await exportBackupJson(repo);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      await downloadBlob(blob, getBackupJsonFilename());
      showToast(`Exported ${backup.stats.notesCount} notes`);
    } catch (err) {
      console.error("Export failed:", err);
      showToast(err.message || "Export failed", true);
    } finally {
      setExporting(null);
    }
  };

  const handleExportMarkdown = async () => {
    if (exporting) return;
    setExporting("markdown");
    try {
      const repo = getDocumentsRepo();
      const backup = await exportBackupJson(repo);
      const blob = await exportMarkdownBundle(repo);
      await downloadBlob(blob, getMarkdownBundleFilename());
      showToast(`Exported ${backup.stats.notesCount} notes as Markdown`);
    } catch (err) {
      console.error("Export failed:", err);
      showToast(err.message || "Export failed", true);
    } finally {
      setExporting(null);
    }
  };

  const handleResetSync = async () => {
    const shouldReset = window.confirm(
      "Reset local sync cache on this device? This will reload data from Supabase."
    );
    if (!shouldReset) return;
    try {
      await resetLocalCache({ force: true });
      showToast("Local sync cache reset. Reloading…");
      window.location.reload();
    } catch (err) {
      console.error("Reset sync failed:", err);
      showToast(err.message || "Reset failed", true);
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
          <h1 className={styles.title}>Backup & Restore</h1>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Export</h2>
          <div className={styles.card}>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Backup JSON</span>
                <span className={styles.cardItemDescription}>
                  Full backup for perfect restore
                </span>
              </div>
              <button
                className={styles.actionButton}
                onClick={handleExportJson}
                disabled={exporting !== null}
              >
                {exporting === "json" ? "Exporting..." : "Export"}
              </button>
            </div>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Markdown Bundle</span>
                <span className={styles.cardItemDescription}>
                  Human-readable .md files in a zip
                </span>
              </div>
              <button
                className={styles.actionButton}
                onClick={handleExportMarkdown}
                disabled={exporting !== null}
              >
                {exporting === "markdown" ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Import</h2>
          <div className={styles.card}>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Import Notes</span>
                <span className={styles.cardItemDescription}>
                  Restore from .json or .zip backup
                </span>
              </div>
              <ImportButton showToast={showToast} />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Sync</h2>
          <div className={styles.card}>
            <div className={styles.cardItem}>
              <div className={styles.cardItemContent}>
                <span className={styles.cardItemTitle}>Reset Sync Cache</span>
                <span className={styles.cardItemDescription}>
                  Clears local data and reloads from Supabase
                </span>
              </div>
              <button
                className={styles.actionButton}
                onClick={handleResetSync}
              >
                Reset
              </button>
            </div>
          </div>
        </section>
      </main>

      {toast && (
        <div className={`${styles.toast} ${toast.isError ? styles.toastError : ""}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function ImportButton({ showToast }) {
  const fileInputRef = useRef(null);
  const router = useRouter();

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    e.target.value = "";

    // Navigate to import preview with file in state
    // For now, store file reference temporarily and navigate
    if (typeof window !== "undefined") {
      window.__pendingImportFile = file;
      router.push("/settings/data/import");
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.zip,.anchored-backup.json"
        onChange={handleFileSelect}
        className={styles.fileInput}
      />
      <button
        className={styles.actionButton}
        onClick={() => fileInputRef.current?.click()}
      >
        Select File
      </button>
    </>
  );
}
