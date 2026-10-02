// Runs on every request. It does two jobs:
//   1. Keeps the logged-in user's session fresh (refreshes their cookies).
//   2. Sends anyone who is NOT logged in back to the login page, unless they
//      are visiting a public page (the home dispatcher, login, register, or
//      either of the two policy pages).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { bounceStamp, type BounceOrigin } from "@/lib/login-marker";

// PHASE 5 added /privacy and /agreement. They MUST be reachable signed out: the
// register page links to them, so they have to be readable before an account
// exists, and a policy nobody can read before agreeing to it is not a policy.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/privacy",
  "/agreement",
];

// The list above is matched EXACTLY, so a trailing slash used to miss it. That
// did not matter while the public pages were only ever reached by clicking a
// link, and it matters now: the policy pages are addresses students TYPE, and
// "relii.vercel.app/privacy/" would have been bounced to /login. This proxy runs
// before Next.js normalises the URL, so the slash has to come off here.
function normalisePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // PAGE PERFORMANCE INSTRUMENT (2026-09-16), present ONLY when
  // RELII_SERVER_TIMING=1. This proxy runs on every request, student pages
  // included, so with the flag off it must be exactly the code it was: no fetch
  // option is passed and no header is set. With the flag on it counts this
  // proxy's own round trips and reports the login check as a Server-Timing
  // header, which a proxy CAN set and a page cannot. It does not import
  // lib/server-timing.ts, which is built around a page render this proxy is not
  // part of.
  const timing = process.env.RELII_SERVER_TIMING === "1";
  let proxyTrips = 0;
  const proxyFetch: typeof fetch | undefined = timing
    ? (input, init) => {
        proxyTrips += 1;
        return fetch(input, init);
      }
    : undefined;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      ...(proxyFetch ? { global: { fetch: proxyFetch } } : {}),
    },
  );

  const authStart = timing ? performance.now() : 0;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authMs = timing ? performance.now() - authStart : 0;

  const isPublic = PUBLIC_PATHS.includes(normalisePath(request.nextUrl.pathname));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Which check sent them here, and when. See lib/login-marker.ts.
    const origin: BounceOrigin = "proxy";
    url.searchParams.set("why", origin);
    url.searchParams.set("at", bounceStamp());
    return NextResponse.redirect(url);
  }

  if (timing) {
    supabaseResponse.headers.set(
      "Server-Timing",
      `proxy-auth;dur=${authMs.toFixed(1)};desc="trips=${proxyTrips} region=${process.env.VERCEL_REGION ?? "unknown"}"`,
    );
  }

  return supabaseResponse;
}
