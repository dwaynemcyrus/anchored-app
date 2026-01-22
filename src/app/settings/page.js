"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetAllBuiltInTemplates } from "../../lib/templates";
import styles from "../../styles/settings.module.css";

export default function SettingsPage() {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

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
      </main>
    </div>
  );
}
