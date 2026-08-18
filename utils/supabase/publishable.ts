import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Public-content queries use the publishable key and remain subject to RLS.
// Initialize lazily so importing a route during `next build` does not require
// deployment secrets before that route actually handles a request.
export function supabasePublishable(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase publishable env is not configured");

    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
