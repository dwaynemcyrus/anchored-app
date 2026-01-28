import { create } from "zustand";
import { getClientId } from "../lib/clientId";
import {
  enqueueTimerStart,
  enqueueTimerStop,
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
    set({
      activeTimer: activeTimer || null,
      status: activeTimer?.status || "idle",
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
    set({
      status: "paused",
      activeTimer: { ...active, status: "paused", note: note ?? active.note, pausedAt: endedAt },
      lastError: null,
    });
    await setActiveTimerMeta({ ...active, status: "paused", note: note ?? active.note, pausedAt: endedAt });
    get().refreshPolling();
    try {
      await enqueueTimerStop({
        entryId: active.entryId,
        note: note ?? active.note,
        endedAt,
        eventType: "pause",
      });
      scheduleSync({ reason: "timer-pause" });
    } catch (error) {
      set({ lastError: error?.message || "Failed to pause timer" });
    }
  },
  resumeTimer: async ({ note } = {}) => {
    const active = get().activeTimer;
    if (!active) return;
    const entryId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const nextTimer = buildActiveTimer({
      entryId,
      entityId: active.entityId,
      entityType: active.entityType,
      label: active.label,
      startedAt,
      status: "running",
      note: note ?? active.note,
      pausedAt: null,
    });
    set({ status: "running", activeTimer: nextTimer, lastError: null });
    await setActiveTimerMeta(nextTimer);
    get().refreshPolling();
    try {
      await enqueueTimerStart({
        entryId,
        entityId: active.entityId,
        entityType: active.entityType,
        note: note ?? active.note,
        startedAt,
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
    set({ status: "idle", activeTimer: null, lastError: null });
    await setActiveTimerMeta(null);
    get().refreshPolling();
    try {
      await enqueueTimerStop({
        entryId: active.entryId,
        note: note ?? active.note,
        endedAt,
        eventType: "stop",
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
