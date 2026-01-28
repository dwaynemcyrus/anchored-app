import { create } from "zustand";
import { getClientId } from "../lib/clientId";
import {
  enqueueTimerStart,
  enqueueTimerStop,
  enqueueTimerResume,
  getActiveTimerMeta,
  setActiveTimerMeta,
  setTimerNotice,
  getTimerNotice,
  reconcileRunningTimer,
} from "../lib/sync/timerSync";
import { scheduleSync } from "../lib/sync/syncManager";

const CLIENT_ID = getClientId();
const ACTIVE_POLL_MS = 12000;
const IDLE_POLL_MS = 60000;
let pollIntervalId = null;
let pollIntervalMs = null;

function isOnline() {
  if (typeof window === "undefined") return false;
  return navigator.onLine;
}

function buildActiveTimer({
  entryId,
  entityId,
  entityType,
  label,
  startedAt,
  status = "running",
  note = null,
  pausedAt = null,
  accumulatedMs = 0,
  segmentStartedAt = null,
}) {
  return {
    entryId,
    entityId,
    entityType,
    label: label ?? null,
    startedAt,
    status,
    note,
    pausedAt,
    accumulatedMs,
    segmentStartedAt,
    clientId: CLIENT_ID,
  };
}

export const useTimerStore = create((set, get) => ({
  status: "idle",
  activeTimer: null,
  lastError: null,
  notice: null,
  hasHydrated: false,
  pollingEnabled: false,
  startPolling: () => {
    if (typeof window === "undefined") return;
    set({ pollingEnabled: true });
    const ensurePolling = () => {
      if (!get().pollingEnabled) return;
      const desiredMs = get().status === "running" ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      if (pollIntervalId && pollIntervalMs === desiredMs) return;
      if (pollIntervalId) {
        window.clearInterval(pollIntervalId);
      }
      pollIntervalMs = desiredMs;
      pollIntervalId = window.setInterval(async () => {
        if (!isOnline()) return;
        try {
          await reconcileRunningTimer();
        } catch (error) {
          set({ lastError: error?.message || "Failed to reconcile timer" });
        }
      }, desiredMs);
    };
    ensurePolling();
  },
  stopPolling: () => {
    set({ pollingEnabled: false });
    if (typeof window === "undefined") return;
    if (pollIntervalId) {
      window.clearInterval(pollIntervalId);
      pollIntervalId = null;
      pollIntervalMs = null;
    }
  },
  refreshPolling: () => {
    if (typeof window === "undefined") return;
    if (!get().pollingEnabled) return;
    const desiredMs = get().status === "running" ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    if (pollIntervalId && pollIntervalMs === desiredMs) return;
    if (pollIntervalId) {
      window.clearInterval(pollIntervalId);
    }
    pollIntervalMs = desiredMs;
    pollIntervalId = window.setInterval(async () => {
      if (!isOnline()) return;
      try {
        await reconcileRunningTimer();
      } catch (error) {
        set({ lastError: error?.message || "Failed to reconcile timer" });
      }
    }, desiredMs);
  },
  hydrate: async () => {
    if (get().hasHydrated) return;
    const activeTimer = await getActiveTimerMeta();
    const notice = await getTimerNotice();
    let nextActiveTimer = activeTimer || null;
    if (nextActiveTimer?.status === "running" && !nextActiveTimer.segmentStartedAt) {
      nextActiveTimer = { ...nextActiveTimer, segmentStartedAt: new Date().toISOString() };
    }
    set({
      activeTimer: nextActiveTimer,
      status: nextActiveTimer?.status || "idle",
      notice: notice || null,
      hasHydrated: true,
    });
    try {
      await reconcileRunningTimer();
    } catch (error) {
      set({ lastError: error?.message || "Failed to reconcile timer" });
    }
    get().refreshPolling();
  },
  clearNotice: () => set({ notice: null }),
  startTimer: async ({ entityId, entityType, label, note }) => {
    if (get().status === "running") return;
    const entryId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const activeTimer = buildActiveTimer({
      entryId,
      entityId,
      entityType,
      label,
      startedAt,
      status: "running",
      note,
      accumulatedMs: 0,
      segmentStartedAt: startedAt,
    });
    set({ status: "running", activeTimer, lastError: null });
    await setActiveTimerMeta(activeTimer);
    get().refreshPolling();
    try {
      await enqueueTimerStart({
        entryId,
        entityId,
        entityType,
        note,
        startedAt,
      });
      scheduleSync({ reason: "timer-start" });
    } catch (error) {
      set({ lastError: error?.message || "Failed to start timer" });
    }
  },
  pauseTimer: async ({ note } = {}) => {
    const active = get().activeTimer;
    if (!active) return;
    const endedAt = new Date().toISOString();
    const segmentStart = Date.parse(active.segmentStartedAt || active.startedAt || "");
    const segmentDuration = Number.isFinite(segmentStart)
      ? Math.max(0, Date.parse(endedAt) - segmentStart)
      : 0;
    const nextAccumulatedMs = (active.accumulatedMs || 0) + segmentDuration;
    set({
      status: "paused",
      activeTimer: {
        ...active,
        status: "paused",
        note: note ?? active.note,
        pausedAt: endedAt,
        accumulatedMs: nextAccumulatedMs,
        segmentStartedAt: null,
      },
      lastError: null,
    });
    await setActiveTimerMeta({
      ...active,
      status: "paused",
      note: note ?? active.note,
      pausedAt: endedAt,
      accumulatedMs: nextAccumulatedMs,
      segmentStartedAt: null,
    });
    get().refreshPolling();
    try {
      await enqueueTimerStop({
        entryId: active.entryId,
        note: note ?? active.note,
        endedAt,
        eventType: "pause",
        durationMs: nextAccumulatedMs,
      });
      scheduleSync({ reason: "timer-pause" });
    } catch (error) {
      set({ lastError: error?.message || "Failed to pause timer" });
    }
  },
  resumeTimer: async ({ note } = {}) => {
    const active = get().activeTimer;
    if (!active) return;
    const segmentStart = new Date().toISOString();
    const nextTimer = buildActiveTimer({
      entryId: active.entryId,
      entityId: active.entityId,
      entityType: active.entityType,
      label: active.label,
      startedAt: active.startedAt,
      status: "running",
      note: note ?? active.note,
      pausedAt: null,
      accumulatedMs: active.accumulatedMs || 0,
      segmentStartedAt: segmentStart,
    });
    set({ status: "running", activeTimer: nextTimer, lastError: null });
    await setActiveTimerMeta(nextTimer);
    get().refreshPolling();
    try {
      await enqueueTimerResume({
        entryId: active.entryId,
        resumedAt: segmentStart,
      });
      scheduleSync({ reason: "timer-resume" });
    } catch (error) {
      set({ lastError: error?.message || "Failed to resume timer" });
    }
  },
  stopTimer: async ({ note } = {}) => {
    const active = get().activeTimer;
    if (!active) return;
    const endedAt = new Date().toISOString();
    const segmentStart = Date.parse(active.segmentStartedAt || active.startedAt || "");
    const segmentDuration = Number.isFinite(segmentStart)
      ? Math.max(0, Date.parse(endedAt) - segmentStart)
      : 0;
    const totalMs = (active.accumulatedMs || 0) + (active.status === "running" ? segmentDuration : 0);
    set({ status: "idle", activeTimer: null, lastError: null });
    await setActiveTimerMeta(null);
    get().refreshPolling();
    try {
      await enqueueTimerStop({
        entryId: active.entryId,
        note: note ?? active.note,
        endedAt,
        eventType: "stop",
        durationMs: totalMs,
      });
      scheduleSync({ reason: "timer-stop" });
    } catch (error) {
      set({ lastError: error?.message || "Failed to stop timer" });
      await setTimerNotice({
        type: "error",
        message: error?.message || "Failed to stop timer",
        at: new Date().toISOString(),
      });
    }
  },
  setSelection: async ({ entityId, entityType, label }) => {
    const active = get().activeTimer;
    if (!active) return;
    const next = { ...active, entityId, entityType, label };
    set({ activeTimer: next });
    await setActiveTimerMeta(next);
  },
}));
