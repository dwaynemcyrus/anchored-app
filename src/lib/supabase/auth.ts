import type { AuthResponse } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

type EmailPasswordCredentials = {
  email: string;
  password: string;
};

type AuthData = AuthResponse["data"];

type MagicLinkPayload = {
  email: string;
  redirectTo?: string | null;
};

export async function getAuthUser() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data?.user ?? null;
}

export async function signInWithPassword({
  email,
  password,
}: EmailPasswordCredentials): Promise<AuthData> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword({
  email,
  password,
}: EmailPasswordCredentials): Promise<AuthData> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signInWithMagicLink({
  email,
  redirectTo,
}: MagicLinkPayload): Promise<AuthData> {
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
