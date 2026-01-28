import { getClientId } from "../clientId";
import { enqueueOperation } from "./syncQueue";
import {
  addTimerEvent,
  updateTimerEvent,
  setTimerMeta,
  getTimerMeta,
} from "../db/timerEvents";
import { getRunningTimeEntry } from "../supabase/timeEntries";

const CLIENT_ID = getClientId();
const LEASE_DURATION_MS = 2 * 60 * 1000;
const ACTIVE_TIMER_META = "activeTimer";
const TIMER_NOTICE_META = "timerNotice";

function buildTimerEvent({
  id,
  timerEntryId,
  eventType,
  entityId,
  entityType,
  note,
  clientTime,
  status = "pending",
}) {
  return {
    id,
    timer_entry_id: timerEntryId,
    event_type: eventType,
    entity_id: entityId,
    entity_type: entityType,
    note: note ?? null,
    client_id: CLIENT_ID,
    client_time: clientTime,
    server_time: null,
    status,
    retry_count: 0,
    nextAttemptAt: null,
    lastError: null,
  };
}

export async function enqueueTimerStart({
  entryId,
  entityId,
  entityType,
  note,
  source = "focus",
  startedAt = new Date().toISOString(),
  leaseExpiresAt,
}) {
  const eventId = crypto.randomUUID();
  const event = buildTimerEvent({
    id: eventId,
    timerEntryId: entryId,
    eventType: "start",
    entityId,
    entityType,
    note,
    clientTime: startedAt,
  });
  await addTimerEvent(event);
  await enqueueOperation({
    table: "time_entries",
    record_id: entryId,
    operation: "start",
    payload: {
      event_id: eventId,
      id: entryId,
      entity_id: entityId,
      entity_type: entityType,
      started_at: startedAt,
      note,
      source,
      client_id: CLIENT_ID,
      lease_expires_at:
        leaseExpiresAt ?? new Date(Date.parse(startedAt) + LEASE_DURATION_MS).toISOString(),
    },
    timestamp: startedAt,
    retry_count: 0,
  });
  await enqueueOperation({
    table: "time_entry_events",
    record_id: eventId,
    operation: "insert",
    payload: {
      id: eventId,
      time_entry_id: entryId,
      event_type: "start",
      event_time: startedAt,
    },
    timestamp: startedAt,
    retry_count: 0,
  });
  return event;
}

export async function enqueueTimerStop({
  entryId,
  note,
  durationMs,
  endedAt = new Date().toISOString(),
  eventType = "stop",
}) {
  const eventId = crypto.randomUUID();
  const event = buildTimerEvent({
    id: eventId,
    timerEntryId: entryId,
    eventType,
    entityId: null,
    entityType: null,
    note,
    clientTime: endedAt,
  });
  await addTimerEvent(event);
  await enqueueOperation({
    table: "time_entries",
    record_id: entryId,
    operation: eventType,
    payload: {
      event_id: eventId,
      id: entryId,
      ended_at: endedAt,
      duration_ms: durationMs ?? null,
      note,
    },
    timestamp: endedAt,
    retry_count: 0,
  });
  await enqueueOperation({
    table: "time_entry_events",
    record_id: eventId,
    operation: "insert",
    payload: {
      id: eventId,
      time_entry_id: entryId,
      event_type: eventType,
      event_time: endedAt,
    },
    timestamp: endedAt,
    retry_count: 0,
  });
  return event;
}

export async function enqueueTimerResume({
  entryId,
  resumedAt = new Date().toISOString(),
  leaseExpiresAt,
}) {
  const eventId = crypto.randomUUID();
  const event = buildTimerEvent({
    id: eventId,
    timerEntryId: entryId,
    eventType: "resume",
    entityId: null,
    entityType: null,
    note: null,
    clientTime: resumedAt,
  });
  await addTimerEvent(event);
  await enqueueOperation({
    table: "time_entries",
    record_id: entryId,
    operation: "resume",
    payload: {
      event_id: eventId,
      id: entryId,
      client_id: CLIENT_ID,
      lease_expires_at: leaseExpiresAt ?? new Date(Date.parse(resumedAt) + LEASE_DURATION_MS).toISOString(),
    },
    timestamp: resumedAt,
    retry_count: 0,
  });
  await enqueueOperation({
    table: "time_entry_events",
    record_id: eventId,
    operation: "insert",
    payload: {
      id: eventId,
      time_entry_id: entryId,
      event_type: "resume",
      event_time: resumedAt,
    },
    timestamp: resumedAt,
    retry_count: 0,
  });
  return event;
}

export async function enqueueTimerTakeover({
  entryId,
  leaseExpiresAt,
  leaseToken = crypto.randomUUID(),
}) {
  const eventId = crypto.randomUUID();
  const eventTime = new Date().toISOString();
  const event = buildTimerEvent({
    id: eventId,
    timerEntryId: entryId,
    eventType: "takeover",
    entityId: null,
    entityType: null,
    note: null,
    clientTime: eventTime,
  });
  await addTimerEvent(event);
  await enqueueOperation({
    table: "time_entries",
    record_id: entryId,
    operation: "takeover",
    payload: {
      event_id: eventId,
      id: entryId,
      client_id: CLIENT_ID,
      lease_expires_at: leaseExpiresAt,
      lease_token: leaseToken,
    },
    timestamp: eventTime,
    retry_count: 0,
  });
  await enqueueOperation({
    table: "time_entry_events",
    record_id: eventId,
    operation: "insert",
    payload: {
      id: eventId,
      time_entry_id: entryId,
      event_type: "takeover",
      event_time: eventTime,
    },
    timestamp: eventTime,
    retry_count: 0,
  });
  return event;
}

export async function markTimerEventSynced(eventId, serverTime) {
  await updateTimerEvent(eventId, {
    status: "synced",
    server_time: serverTime ?? new Date().toISOString(),
  });
}

export async function markTimerEventFailed(eventId, errorDetails) {
  await updateTimerEvent(eventId, {
    status: "failed",
    lastError: errorDetails ?? null,
  });
}

export async function setActiveTimerMeta(value) {
  return setTimerMeta(ACTIVE_TIMER_META, value);
}

export async function getActiveTimerMeta() {
  return getTimerMeta(ACTIVE_TIMER_META);
}

export async function setTimerNotice(value) {
  return setTimerMeta(TIMER_NOTICE_META, value);
}

export async function getTimerNotice() {
  return getTimerMeta(TIMER_NOTICE_META);
}

export async function reconcileRunningTimer() {
  const running = await getRunningTimeEntry();
  if (!running) return null;
  const active = await getActiveTimerMeta();
  if (
    running.client_id &&
    running.client_id !== CLIENT_ID &&
    running.lease_expires_at
  ) {
    const leaseExpiry = Date.parse(running.lease_expires_at);
    if (!Number.isNaN(leaseExpiry) && leaseExpiry > Date.now()) {
      await setTimerNotice({
        type: "lease",
        message: "Another device is running this timer.",
        serverEntryId: running.id,
        serverClientId: running.client_id,
        leaseExpiresAt: running.lease_expires_at,
        at: new Date().toISOString(),
      });
      return running;
    }
  }
  if (active && active.entryId && active.entryId !== running.id) {
    await setTimerNotice({
      type: "conflict",
      message: "Another device updated the running timer.",
      serverEntryId: running.id,
      localEntryId: active.entryId,
      at: new Date().toISOString(),
    });
  }
  return running;
}

export function getLeaseDurationMs() {
  return LEASE_DURATION_MS;
}
