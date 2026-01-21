"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../../../styles/import.module.css";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import { dryRunImport, applyImport, detectImportFormat } from "@/lib/backup/importer";
import { useDocumentsStore } from "@/store/documentsStore";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [toast, setToast] = useState(null);

  // Danger zone gates
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const hydrate = useDocumentsStore((s) => s.hydrate);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load file from window state on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.__pendingImportFile) {
      const pendingFile = window.__pendingImportFile;
      delete window.__pendingImportFile;
      setFile(pendingFile);
      runDryRun(pendingFile);
    } else {
      // No file, go back
      router.replace("/settings/data");
    }
  }, [router]);

  const runDryRun = async (importFile) => {
    setLoading(true);
    try {
      const repo = getDocumentsRepo();
      const result = await dryRunImport(importFile, repo);
      setDryRunResult(result);
    } catch (err) {
      console.error("Dry run failed:", err);
      setDryRunResult({
        success: false,
        error: err.message || "Failed to analyze file",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMergeImport = async () => {
    if (importing || !file) return;
    setImporting(true);
    try {
      const repo = getDocumentsRepo();
      const result = await applyImport(file, repo, "merge");
      if (result.success) {
        setImportResult(result);
        await hydrate();
      } else {
        showToast(result.error || "Import failed", true);
      }
    } catch (err) {
      console.error("Import failed:", err);
      showToast(err.message || "Import failed", true);
    } finally {
      setImporting(false);
    }
  };

  const handleReplaceAll = async () => {
    if (importing || !file) return;
    setImporting(true);
    try {
      const repo = getDocumentsRepo();
      const result = await applyImport(file, repo, "replaceAll");
      if (result.success) {
        setImportResult(result);
        await hydrate();
      } else {
        showToast(result.error || "Replace failed", true);
      }
    } catch (err) {
      console.error("Replace failed:", err);
      showToast(err.message || "Replace failed", true);
    } finally {
      setImporting(false);
    }
  };

  const canReplaceAll =
    dryRunResult?.success &&
    dryRunResult.format === "backupJson" &&
    confirmChecked &&
    confirmText === "REPLACE";

  // If import completed, show result
  if (importResult) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.title}>Import Complete</h1>
          </header>

          <div className={styles.card}>
            <div className={styles.resultCard}>
              <h2 className={styles.resultTitle}>
                {importResult.conflicts > 0
                  ? "Import completed with conflicts"
                  : "Import successful"}
              </h2>
              <div className={styles.resultStats}>
                <span className={styles.resultStat}>
                  <strong>{importResult.added}</strong> added
                </span>
                <span className={styles.resultStat}>
                  <strong>{importResult.updated}</strong> updated
                </span>
                <span className={styles.resultStat}>
                  <strong>{importResult.skipped}</strong> skipped
                </span>
                {importResult.conflicts > 0 && (
                  <span className={styles.resultStat}>
                    <strong>{importResult.conflicts}</strong> conflicts
                  </span>
                )}
              </div>
              {importResult.conflicts > 0 && (
                <Link href="/knowledge/notes?filter=conflicts" className={styles.conflictLink}>
                  View {importResult.conflicts} conflict{importResult.conflicts !== 1 ? "s" : ""} &rarr;
                </Link>
              )}
            </div>

            <div className={styles.actions}>
              <button
                className={styles.importButton}
                onClick={() => router.push("/knowledge/notes")}
              >
                Go to Notes
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
          <h1 className={styles.title}>Import Preview</h1>
        </header>

        <div className={styles.card}>
          {file && (
            <div className={styles.fileInfo}>
              <span className={styles.fileName}>{file.name}</span>
              {dryRunResult?.success && (
                <span className={styles.fileFormat}>
                  {dryRunResult.format === "backupJson"
                    ? `Backup JSON (v${dryRunResult.backupVersion})`
                    : "Markdown Bundle"}
                  {" \u2022 "}
                  {dryRunResult.totalIncoming} note{dryRunResult.totalIncoming !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>Analyzing file...</span>
            </div>
          )}

          {!loading && dryRunResult && !dryRunResult.success && (
            <div className={styles.errorState}>{dryRunResult.error}</div>
          )}

          {!loading && dryRunResult?.success && (
            <div className={styles.previewSection}>
              <h3 className={styles.previewTitle}>Import Preview</h3>
              <div className={styles.stats}>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{dryRunResult.plan.addCount}</span>
                  <span className={styles.statLabel}>Add</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{dryRunResult.plan.updateCount}</span>
                  <span className={styles.statLabel}>Update</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statValue}>{dryRunResult.plan.skipCount}</span>
                  <span className={styles.statLabel}>Skip</span>
                </div>
                <div
                  className={`${styles.statItem} ${
                    dryRunResult.plan.conflictCount > 0 ? styles.statItemConflict : ""
                  }`}
                >
                  <span className={styles.statValue}>{dryRunResult.plan.conflictCount}</span>
                  <span className={styles.statLabel}>Conflicts</span>
                </div>
              </div>
            </div>
          )}

          {!loading && dryRunResult?.success && (
            <div className={styles.actions}>
              <button
                className={styles.cancelButton}
                onClick={() => router.back()}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                className={styles.importButton}
                onClick={handleMergeImport}
                disabled={importing}
              >
                {importing ? "Importing..." : "Import (Merge)"}
              </button>
            </div>
          )}
        </div>

        {/* Danger Zone - Replace All */}
        {!loading && dryRunResult?.success && dryRunResult.format === "backupJson" && (
          <div className={styles.dangerZone}>
            <h3 className={styles.dangerTitle}>Danger Zone</h3>
            <p className={styles.dangerDescription}>
              Replace All will delete all your existing notes and restore exactly what&apos;s in
              this backup file. This cannot be undone.
            </p>
            <div className={styles.dangerGates}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  disabled={importing}
                />
                I understand this will delete all my local notes
              </label>
              <input
                type="text"
                className={styles.confirmInput}
                placeholder='Type "REPLACE" to confirm'
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={importing}
              />
              <button
                className={styles.dangerButton}
                onClick={handleReplaceAll}
                disabled={!canReplaceAll || importing}
              >
                {importing ? "Replacing..." : "Replace All"}
              </button>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div className={`${styles.toast} ${toast.isError ? styles.toastError : ""}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
