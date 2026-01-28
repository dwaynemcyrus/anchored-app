import { getSupabaseClient, getUserId } from "./client";

const ACTIVITIES_TABLE = "activities";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unwrapResponse({ data, error }) {
  if (error) {
    throw error;
  }
  return data;
}

export async function listActivities({ status = "active", limit = 100 } = {}) {
  const client = getSupabaseClient();
  const userId = await getUserId();
  let query = client
    .from(ACTIVITIES_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const response = await query;
  return unwrapResponse(response);
}

export async function createActivity({ name }) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Activity name is required");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(ACTIVITIES_TABLE)
    .insert({
      user_id: userId,
      name: name.trim(),
      status: "active",
    })
    .select("*")
    .single();

  return unwrapResponse(response);
}

export async function updateActivityStatus(id, status) {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new Error("Activity id must be a UUID");
  }
  if (typeof status !== "string" || !status.trim()) {
    throw new Error("Activity status is required");
  }
  const client = getSupabaseClient();
  const userId = await getUserId();
  const response = await client
    .from(ACTIVITIES_TABLE)
    .update({
      status: status.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  return unwrapResponse(response);
}
