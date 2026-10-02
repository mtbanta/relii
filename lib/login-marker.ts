// THE LOGIN MARKER (2026-10-02). When server code sends somebody to the login
// page, it writes WHICH CHECK sent them and WHEN into the address they land on:
//
//   /login?why=proxy&at=20261002T133107Z
//
// WHY IT EXISTS. On 2026-10-02 an instructor was bounced to /login while signed
// in, and by the time anyone looked there was nothing to look at: Vercel's
// Hobby plan keeps about an hour of logs. The address bar is the one record
// that survives, because the person reporting the bounce can read it out or
// screenshot it.
//
// WHAT IT TELLS YOU, AND THE THIRD CASE IS THE POINT:
//   why=proxy, time just now  -> the proxy's login check failed on this request.
//   why=page,  time just now  -> the proxy passed it and the page's own check
//                                failed (requireInstructor).
//   either, with an OLD time  -> no check ran at all. The browser replayed a
//                                redirect it had remembered from that earlier
//                                moment, which is the Roster bounce.
//
// WHAT IT WRITES: one of two fixed words and a UTC time to the second.
// WHAT IT NEVER WRITES: an email, a name, a user id, a token, or the page the
// person was heading for. Nothing is stored anywhere; it exists only in the
// address.
//
// It is a pure function with no imports so that the proxy, which runs on every
// request, can use it without pulling anything else in.
export type BounceOrigin = "proxy" | "page";

// 20261002T133107Z: no dashes or colons, so it reads cleanly in an address bar
// instead of arriving percent-encoded.
export function bounceStamp(now: Date = new Date()): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
