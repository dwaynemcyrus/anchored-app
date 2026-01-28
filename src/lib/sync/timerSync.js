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
    },
    timestamp: startedAt,
    retry_count: 0,
  });
  return event;
}

export async function enqueueTimerStop({
  entryId,
  note,
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
    operation: "stop",
    payload: {
      event_id: eventId,
      id: entryId,
      ended_at: endedAt,
      note,
    },
    timestamp: endedAt,
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
