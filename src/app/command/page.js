"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDocumentsRepo } from "@/lib/repo/getDocumentsRepo";
import styles from "../../styles/command.module.css";

export default function CommandPage() {
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInboxCount() {
      try {
        const repo = getDocumentsRepo();
        const count = await repo.getInboxCount();
        setInboxCount(count);
      } catch (err) {
        console.error("Failed to load inbox count:", err);
      } finally {
        setLoading(false);
      }
    }
    loadInboxCount();
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Command</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Process</h2>
          <Link href="/inbox" className={styles.actionCard}>
            <div className={styles.actionCardContent}>
              <span className={styles.actionCardTitle}>Inbox</span>
              <span className={styles.actionCardDescription}>
                Process captured notes
              </span>
            </div>
            <div className={styles.actionCardRight}>
              {!loading && (
                <span
                  className={`${styles.badge} ${
                    inboxCount === 0 ? styles.badgeEmpty : ""
                  }`}
                >
                  {inboxCount}
                </span>
              )}
              <span className={styles.arrow}>&rarr;</span>
            </div>
          </Link>
        </section>

        <div className={styles.placeholder} />
      </main>
    </div>
  );
}
