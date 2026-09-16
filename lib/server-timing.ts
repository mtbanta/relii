// PAGE PERFORMANCE INSTRUMENT (2026-09-16). SERVER ONLY. OFF UNLESS
// RELII_SERVER_TIMING=1.
//
// WHAT IT MEASURES: every round trip this server makes to Supabase while
// rendering one page, database reads and login checks alike, each with its
// start and end offset from the moment the request first created a Supabase
// client. Offsets rather than bare durations, because a layout and a page
// render in parallel, and a list of durations makes parallel and serial look
// identical.
//
// HOW: lib/supabase/admin.ts and lib/supabase/server.ts hand Supabase the
// pass-through fetch below, and ONLY when the flag is on. With the flag off
// neither client is given any fetch option at all, so it is byte for byte the
// client it was before this file existed.
//
// ==> WHY IT IS NOT A Server-Timing RESPONSE HEADER, WHICH IS WHAT THE KICKOFF
//     ASKED FOR. A page cannot set a response header: headers() in a Server
//     Component is read-only (Next.js API reference, headers.md). So the report
//     is written into the page itself, as a JSON block the browser never
//     executes, by components/server-timing-report.tsx. proxy.ts CAN set
//     headers, and it reports its own login check as a real Server-Timing
//     header. <==
//
// ==> WHAT "END" MEANS: when the response HEADERS arrived, not when the body
//     finished. Waiting for the body would mean reading it here and building a
//     second Response, which is exactly the kind of change a pass-through must
//     not make. These bodies are a few kilobytes, so the difference is small,
//     and it is stated here rather than hidden. <==
import { cache } from "react";

export function serverTimingEnabled(): boolean {
  return process.env.RELII_SERVER_TIMING === "1";
}

export type Trip = {
  n: number;
  what: string;
  status: number | null;
  startMs: number;
  endMs: number | null;
};

type Store = {
  t0: number;
  trips: Trip[];
  // How many stores this server copy had created before this one. Zero means
  // this request is the first thing this copy of the server ever measured,
  // which is what makes a sample COLD by observation rather than by waiting.
  storesBefore: number;
  instanceAgeMs: number;
};

// Module state, one per running copy of the server.
const instanceBornAt = performance.now();
let storesCreated = 0;

// One store per request. React's cache() is scoped to a single server render,
// so the layout and the page of one request share it, and the next request gets
// a fresh one. Outside a render (an API route) it simply makes a new store each
// call, which nothing reads.
const getStore = cache((): Store => {
  const store: Store = {
    t0: performance.now(),
    trips: [],
    storesBefore: storesCreated,
    instanceAgeMs: Math.round(performance.now() - instanceBornAt),
  };
  storesCreated += 1;
  return store;
});

// Names a trip without its values: the table or auth endpoint, the method, the
// selected columns and the NAMES of the filters. Never a filter value, so no id,
// email or class of anybody's ends up in a page.
function describe(input: RequestInfo | URL, init?: RequestInit): string {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const path = url.pathname.replace(/^\/rest\/v1\//, "").replace(/^\/auth\/v1\//, "auth/");
  const parts: string[] = [];
  for (const [key, value] of url.searchParams) {
    if (key === "select") parts.push(`select=${value.slice(0, 60)}`);
    else if (key === "order" || key === "limit") parts.push(`${key}=${value}`);
    else parts.push(`${key}=?`);
  }
  return `${method} ${path}${parts.length ? ` ${parts.join(" ")}` : ""}`;
}

// The pass-through fetch, or undefined when the flag is off.
export function timedFetch(): typeof fetch | undefined {
  if (!serverTimingEnabled()) return undefined;
  const store = getStore();
  return async (input, init) => {
    const trip: Trip = {
      n: store.trips.length + 1,
      what: describe(input, init),
      status: null,
      startMs: round(performance.now() - store.t0),
      endMs: null,
    };
    store.trips.push(trip);
    try {
      const response = await fetch(input, init);
      trip.status = response.status;
      return response;
    } finally {
      trip.endMs = round(performance.now() - store.t0);
    }
  };
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export type TimingReport = {
  segment: string;
  region: string | null;
  storesBefore: number;
  instanceAgeMs: number;
  snapshotMs: number;
  trips: Trip[];
};

// A copy of the store as it stands right now. Called while the segment is being
// drawn, which is after every await in that segment has finished.
export function readTimingReport(segment: string): TimingReport {
  const store = getStore();
  return {
    segment,
    region: process.env.VERCEL_REGION ?? null,
    storesBefore: store.storesBefore,
    instanceAgeMs: store.instanceAgeMs,
    snapshotMs: round(performance.now() - store.t0),
    trips: store.trips.map((trip) => ({ ...trip })),
  };
}
