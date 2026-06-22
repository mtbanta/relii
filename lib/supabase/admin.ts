// Supabase client that uses the secret "service_role" key. SERVER ONLY.
//
// This key bypasses Row Level Security, so the server can write session rows
// (which ordinary users are not allowed to write). It must NEVER be imported
// into a Client Component or sent to the browser. Only route handlers and other
// server code may use it.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase server credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }

  return createSupabaseClient(url, serviceKey, {
    // This is a stateless server client; it never handles a user's login session.
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
