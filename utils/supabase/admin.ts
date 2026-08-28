import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client keyed with the secret (service-role) key. It
// bypasses RLS, so NEVER import this into a Client Component. Lazily created so
// a missing env var doesn't throw at import time (e.g. during build).
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Supabase admin env is not configured");
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
