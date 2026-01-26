import { createClient } from "@supabase/supabase-js";

let supabaseClient = null;

function requireBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Supabase client is browser-only");
  }
}

function getEnvValue(name) {
  let value = "";
  if (name === "NEXT_PUBLIC_SUPABASE_URL") {
    value = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  }
  if (name === "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
    value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  }
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getSupabaseClient() {
  requireBrowser();
  if (supabaseClient) return supabaseClient;

  const url = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return supabaseClient;
}
