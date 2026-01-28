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

function buildActiveTimer({
  entryId,
  entityId,
  entityType,
  label,
  startedAt,
  status = "running",
  note = null,
}) {
  return {
    entryId,
    entityId,
    entityType,
    label: label ?? null,
    startedAt,
    status,
    note,
    clientId: CLIENT_ID,
  };
}

export const useTimerStore = create((set, get) => ({
  status: "idle",
  activeTimer: null,
  lastError: null,
  notice: null,
  hasHydrated: false,
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
  },
  clearNotice: () => set({ notice: null }),
  startTimer: async ({ entityId, entityType, label, note }) => {
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
      activeTimer: { ...active, status: "paused", note: note ?? active.note },
      lastError: null,
    });
    await setActiveTimerMeta({ ...active, status: "paused", note: note ?? active.note });
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
    });
    set({ status: "running", activeTimer: nextTimer, lastError: null });
    await setActiveTimerMeta(nextTimer);
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
