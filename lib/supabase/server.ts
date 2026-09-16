// Supabase client for use on the server (Server Components, Route Handlers).
// It connects the logged-in user's session to Supabase by reading and writing cookies.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timedFetch } from "@/lib/server-timing";

export async function createClient() {
  const cookieStore = await cookies();

  // PAGE PERFORMANCE INSTRUMENT: present ONLY when RELII_SERVER_TIMING=1. See
  // lib/supabase/admin.ts.
  const fetch = timedFetch();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // This runs inside a Server Component, where cookies cannot be set.
            // The middleware refreshes the session instead, so this is safe to ignore.
          }
        },
      },
      ...(fetch ? { global: { fetch } } : {}),
    },
  );
}
