import { getSupabaseClient } from "./client";

export async function getAuthUser() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data?.user ?? null;
}

export async function signInWithPassword({ email, password }) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword({ email, password }) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signInWithMagicLink({ email, redirectTo }) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
