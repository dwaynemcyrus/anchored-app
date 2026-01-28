"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTimerStore } from "../../store/timerStore";
import { listActivities, createActivity } from "../../lib/supabase/activities";
import { listTimeEntryEvents } from "../../lib/supabase/timeEntries";
import DocumentPickerModal from "../../components/workbench/DocumentPickerModal";
import { getDocumentsRepo } from "../../lib/repo/getDocumentsRepo";
import { deriveDocumentTitle } from "../../lib/documents/deriveTitle";
import {
  DOCUMENT_TYPE_NOTE,
  DOCUMENT_TYPE_TASK,
  DOCUMENT_TYPE_HABIT,
  DOCUMENT_TYPE_PROJECT,
} from "../../types/document";
import styles from "../../styles/focus.module.css";

const SELECTION_TYPES = [
  DOCUMENT_TYPE_NOTE,
  DOCUMENT_TYPE_TASK,
  DOCUMENT_TYPE_HABIT,
  DOCUMENT_TYPE_PROJECT,
];

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export default function FocusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerStatus = useTimerStore((state) => state.status);
  const activeTimer = useTimerStore((state) => state.activeTimer);
  const notice = useTimerStore((state) => state.notice);
  const lastError = useTimerStore((state) => state.lastError);
  const hydrateTimer = useTimerStore((state) => state.hydrate);
  const startPolling = useTimerStore((state) => state.startPolling);
  const stopPolling = useTimerStore((state) => state.stopPolling);
  const startTimer = useTimerStore((state) => state.startTimer);
  const pauseTimer = useTimerStore((state) => state.pauseTimer);
  const resumeTimer = useTimerStore((state) => state.resumeTimer);
  const stopTimer = useTimerStore((state) => state.stopTimer);
  const leaseInfo = useTimerStore((state) => state.leaseInfo);
  const takeOverTimer = useTimerStore((state) => state.takeOverTimer);

  const [showDocPicker, setShowDocPicker] = useState(false);
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activityName, setActivityName] = useState("");
  const [selection, setSelection] = useState(null);
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [eventHistory, setEventHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const elapsedMs = useMemo(() => {
    if (!activeTimer) return 0;
    const baseMs = activeTimer.accumulatedMs || 0;
    if (timerStatus === "running") {
      const segmentStartedAt = Date.parse(activeTimer.segmentStartedAt || "");
      if (!segmentStartedAt) return baseMs;
      return baseMs + Math.max(0, tick - segmentStartedAt);
    }
    return baseMs;
  }, [activeTimer, timerStatus, tick]);

  useEffect(() => {
    hydrateTimer();
    startPolling();
    return () => {
      stopPolling();
    };
  }, [hydrateTimer, startPolling, stopPolling]);

  useEffect(() => {
    if (timerStatus !== "running") return undefined;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timerStatus]);

  useEffect(() => {
    let active = true;
    const loadActivities = async () => {
      setLoadingActivities(true);
      try {
        const data = await listActivities({ status: "active" });
        if (active) setActivities(data || []);
      } catch (error) {
        console.error("Failed to load activities", error);
      } finally {
        if (active) setLoadingActivities(false);
      }
    };
    loadActivities();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeTimer) return;
    if (activeTimer.entityId) {
      setSelection({
        id: activeTimer.entityId,
        type: activeTimer.entityType,
        label: activeTimer.label,
      });
    }
  }, [activeTimer]);

  useEffect(() => {
    if (!activeTimer?.entryId) return;
    let active = true;
    const loadEvents = async () => {
      try {
        const events = await listTimeEntryEvents({ entryId: activeTimer.entryId, limit: 200 });
        if (active) setEventHistory(events || []);
      } catch (error) {
        console.error("Failed to load time entry events", error);
      }
    };
    loadEvents();
    return () => {
      active = false;
    };
  }, [activeTimer?.entryId, timerStatus]);

  useEffect(() => {
    const entityId = searchParams.get("entityId");
    const entityType = searchParams.get("entityType");
    if (!entityId || !entityType) return;
    let active = true;
    const loadEntity = async () => {
      try {
        if (entityType === "activity") {
          const activity = activities.find((item) => item.id === entityId);
          if (activity && active) {
            setSelection({
              id: activity.id,
              type: "activity",
              label: activity.name,
            });
          }
          return;
        }
        const repo = getDocumentsRepo();
        const doc = await repo.get(entityId);
        if (!doc || !active) return;
        setSelection({
          id: doc.id,
          type: doc.type,
          label: deriveDocumentTitle(doc),
        });
      } catch (error) {
        console.error("Failed to load selection", error);
      }
    };
    loadEntity();
    return () => {
      active = false;
    };
  }, [searchParams, activities]);

  const handleCreateActivity = async () => {
    if (!activityName.trim()) return;
    try {
      const created = await createActivity({ name: activityName.trim() });
      setActivities((prev) => [created, ...prev]);
      setActivityName("");
      setSelection({
        id: created.id,
        type: "activity",
        label: created.name,
      });
    } catch (error) {
      console.error("Failed to create activity", error);
    }
  };

  const handleStart = async () => {
    if (!selection) return;
    await startTimer({
      entityId: selection.id,
      entityType: selection.type,
      label: selection.label,
      note: note || null,
    });
  };

  const handlePause = async () => {
    await pauseTimer({ note: note || null });
  };

  const handleResume = async () => {
    await resumeTimer({ note: note || null });
  };

  const handleStop = async () => {
    await stopTimer({ note: note || null });
  };

  const selectionLabel = selection ? `${selection.label} · ${selection.type}` : "No selection";
  const pauseSegments = eventHistory.filter((event) => event.event_type === "pause");
  const pauseCount = pauseSegments.length;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.back()}
            aria-label="Go back"
          >
            &larr;
          </button>
          <div>
            <div className={styles.kicker}>Focus Timer</div>
            <h1 className={styles.title}>{selectionLabel}</h1>
          </div>
        </header>

        <section className={styles.timerCard}>
          <div className={styles.timerDisplay}>{formatDuration(elapsedMs)}</div>
          <div className={styles.timerStatus}>
            {timerStatus === "running" ? "Running" : timerStatus === "paused" ? "Paused" : "Idle"}
          </div>
          {timerStatus === "paused" ? (
            <div className={styles.pauseBadge}>Paused</div>
          ) : null}
          {pauseCount > 0 ? (
            <div className={styles.pauseSummary}>
              Paused {pauseCount} {pauseCount === 1 ? "time" : "times"}
            </div>
          ) : null}
          <div className={styles.timerActions}>
            {timerStatus === "running" ? (
              <>
                <button type="button" className={styles.secondaryButton} onClick={handlePause}>
                  Pause
                </button>
                <button type="button" className={styles.primaryButton} onClick={handleStop}>
                  Stop
                </button>
              </>
            ) : timerStatus === "paused" ? (
              <>
                <button type="button" className={styles.secondaryButton} onClick={handleResume}>
                  Resume
                </button>
                <button type="button" className={styles.primaryButton} onClick={handleStop}>
                  Stop
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleStart}
                disabled={!selection}
              >
                Start
              </button>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>What are you working on?</h2>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowDocPicker(true)}
                disabled={timerStatus === "running"}
              >
                Select document
              </button>
            </div>
          </div>
          <div className={styles.selectionInfo}>
            {selection ? (
              <>
                <div className={styles.selectionTitle}>{selection.label}</div>
                <div className={styles.selectionMeta}>{selection.type}</div>
              </>
            ) : (
              <div className={styles.selectionEmpty}>
                Choose a task, habit, note, or project.
              </div>
            )}
          </div>

          <div className={styles.activities}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelSubtitle}>Activities</h3>
              <div className={styles.activityInput}>
                <input
                  type="text"
                  value={activityName}
                  onChange={(event) => setActivityName(event.target.value)}
                  placeholder="New activity name"
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleCreateActivity}
                >
                  Add
                </button>
              </div>
            </div>
            {loadingActivities ? (
              <div className={styles.selectionEmpty}>Loading activities...</div>
            ) : activities.length === 0 ? (
              <div className={styles.selectionEmpty}>No saved activities yet.</div>
            ) : (
              <div className={styles.activityList}>
                {activities.map((activity) => (
                  <button
                    key={activity.id}
                    type="button"
                    className={`${styles.activityCard} ${
                      selection?.id === activity.id ? styles.activityCardActive : ""
                    }`}
                    onClick={() =>
                      setSelection({
                        id: activity.id,
                        type: "activity",
                        label: activity.name,
                      })
                    }
                    disabled={timerStatus === "running"}
                  >
                    <div className={styles.activityName}>{activity.name}</div>
                    <div className={styles.activityMeta}>Activity</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.noteBlock}>
            <label className={styles.noteLabel} htmlFor="time-note">
              Time note (optional)
            </label>
            <textarea
              id="time-note"
              className={styles.noteInput}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add context for this time block..."
            />
          </div>
          {pauseSegments.length > 0 ? (
            <div className={styles.historyBlock}>
              <button
                type="button"
                className={styles.historyToggle}
                onClick={() => setShowHistory((prev) => !prev)}
              >
                {showHistory ? "Hide pause/resume history" : "Show pause/resume history"}
              </button>
              {showHistory ? (
                <div className={styles.historyList}>
                  {eventHistory.map((event) => (
                    <div key={event.id} className={styles.historyRow}>
                      <span className={styles.historyType}>{event.event_type}</span>
                      <span className={styles.historyTime}>
                        {new Date(event.event_time).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {leaseInfo ? (
          <div className={styles.leaseBanner}>
            <div>
              Another device is running this timer until{" "}
              {new Date(leaseInfo.leaseExpiresAt).toLocaleTimeString()}.
            </div>
            <button type="button" className={styles.takeoverButton} onClick={takeOverTimer}>
              Take over
            </button>
          </div>
        ) : null}
        {lastError ? <div className={styles.errorBanner}>{lastError}</div> : null}
        {notice ? <div className={styles.noticeBanner}>{notice.message}</div> : null}
      </main>

      <DocumentPickerModal
        isOpen={showDocPicker}
        onCancel={() => setShowDocPicker(false)}
        onSelect={(doc) => {
          setSelection({ id: doc.id, type: doc.type, label: doc.title || "Untitled" });
          setShowDocPicker(false);
        }}
        allowedTypes={SELECTION_TYPES}
        title="Select a task, habit, note, or project"
      />
    </div>
  );
}
