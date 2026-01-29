import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

function getEnvValue(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name] || "";
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const url = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
