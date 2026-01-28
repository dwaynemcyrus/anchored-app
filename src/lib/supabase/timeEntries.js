import { getSupabaseClient, getUserId } from "./client";

const TIME_ENTRIES_TABLE = "time_entries";
const TIME_ENTRY_EVENTS_TABLE = "time_entry_events";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unwrapResponse({ data, error }) {
  if (error) {
    throw error;
  }
  return data;
}

function toIsoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") return value;
  throw new Error("Invalid timestamp value");
}

export async function listTimeEntries({
  start,
  end,
  limit = 200,
  entityType,
  entityId,
} = {}) {
  const client = getSupabaseClient();
  const userId = await getUserId();
  let query = client
    .from(TIME_ENTRIES_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });

  const startIso = toIsoTimestamp(start);
  const endIso = toIsoTimestamp(end);
  if (startIso) {
    query = query.gte("started_at", startIso);
  }
  if (endIso) {
    query = query.lte("started_at", endIso);
  }
  if (entityType) {
    query = query.eq("entity_type", entityType);
  }
  if (entityId) {
    query = query.eq("entity_id", entityId);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const response = await query;
  return unwrapResponse(response);
}

export async function listTimeEntryEvents({ entryId, limit = 200 } = {}) {
  if (typeof entryId !== "string" || !UUID_PATTERN.test(entryId)) {
    throw new Error("Time entry id must be a UUID");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  let query = client
    .from(TIME_ENTRY_EVENTS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("time_entry_id", entryId)
    .order("event_time", { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const response = await query;
  return unwrapResponse(response);
}

export async function listTimeEntryPauseCounts({ entryIds = [] } = {}) {
  const ids = Array.isArray(entryIds)
    ? entryIds.filter((id) => typeof id === "string" && UUID_PATTERN.test(id))
    : [];
  if (ids.length === 0) return {};
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(TIME_ENTRY_EVENTS_TABLE)
    .select("time_entry_id,event_type")
    .eq("user_id", userId)
    .in("time_entry_id", ids);

  const data = unwrapResponse(response);
  const counts = {};
  for (const event of data || []) {
    if (event.event_type !== "pause") continue;
    counts[event.time_entry_id] = (counts[event.time_entry_id] || 0) + 1;
  }
  return counts;
}

export async function createTimeEntryEvent({
  entryId,
  eventType,
  eventTime = new Date().toISOString(),
} = {}) {
  if (typeof entryId !== "string" || !UUID_PATTERN.test(entryId)) {
    throw new Error("Time entry id must be a UUID");
  }
  if (typeof eventType !== "string" || !eventType.trim()) {
    throw new Error("Event type is required");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(TIME_ENTRY_EVENTS_TABLE)
    .insert({
      user_id: userId,
      time_entry_id: entryId,
      event_type: eventType.trim(),
      event_time: toIsoTimestamp(eventTime),
    })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function getRunningTimeEntry() {
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(TIME_ENTRIES_TABLE)
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();

  return unwrapResponse(response);
}

export async function startTimeEntry({
  id,
  entityId,
  entityType,
  startedAt = new Date().toISOString(),
  note = null,
  source = null,
} = {}) {
  if (typeof entityType !== "string" || !entityType.trim()) {
    throw new Error("Entity type is required");
  }
  if (typeof entityId !== "string" || !UUID_PATTERN.test(entityId)) {
    throw new Error("Entity id must be a UUID");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(TIME_ENTRIES_TABLE)
    .insert({
      ...(id ? { id } : {}),
      user_id: userId,
      entity_id: entityId,
      entity_type: entityType,
      started_at: toIsoTimestamp(startedAt),
      ended_at: null,
      duration_ms: null,
      note,
      source,
    })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function stopTimeEntry({
  id,
  endedAt = new Date().toISOString(),
  note,
  durationMs,
} = {}) {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new Error("Time entry id must be a UUID");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  const endIso = toIsoTimestamp(endedAt);

  let nextDurationMs = durationMs;
  if (typeof nextDurationMs !== "number") {
    const { data: existing, error: fetchError } = await client
      .from(TIME_ENTRIES_TABLE)
      .select("started_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing?.started_at) {
      throw new Error("Time entry not found");
    }

    const startedAt = new Date(existing.started_at);
    nextDurationMs = Math.max(0, new Date(endIso).getTime() - startedAt.getTime());
  }

  const response = await client
    .from(TIME_ENTRIES_TABLE)
    .update({
      ended_at: endIso,
      duration_ms: nextDurationMs,
      updated_at: new Date().toISOString(),
      ...(note !== undefined ? { note } : {}),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function resumeTimeEntry({ id } = {}) {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new Error("Time entry id must be a UUID");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(TIME_ENTRIES_TABLE)
    .update({ ended_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return unwrapResponse(response);
}
