"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../../styles/settings.module.css";

export default function SettingsPage() {
  const router = useRouter();

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
      </main>
    </div>
  );
}
