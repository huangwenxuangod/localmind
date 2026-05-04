import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getDb() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for server persistence");
  }

  if (!key) {
    throw new Error("A Supabase API key is required: use SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
