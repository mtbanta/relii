// Supabase client that uses the secret "service_role" key. SERVER ONLY.
//
// This key bypasses Row Level Security, so the server can write session rows
// (which ordinary users are not allowed to write). It must NEVER be imported
// into a Client Component or sent to the browser. Only route handlers and other
// server code may use it.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { timedFetch } from "@/lib/server-timing";

export function createAdminClient() {
  // Strip any stray whitespace or line breaks that can sneak in when these are
  // pasted into a hosting dashboard.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, "");

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase server credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }

  // PAGE PERFORMANCE INSTRUMENT: a pass-through fetch that times each round
  // trip, present ONLY when RELII_SERVER_TIMING=1. With the flag off there is no
  // `global` option at all, which is the client exactly as it was before.
  const fetch = timedFetch();

  return createSupabaseClient(url, serviceKey, {
    // This is a stateless server client; it never handles a user's login session.
    auth: { autoRefreshToken: false, persistSession: false },
    ...(fetch ? { global: { fetch } } : {}),
  });
}
