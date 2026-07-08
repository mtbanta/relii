// Shared rules for graded assignment submissions.
//
// A graded submission is ONE continuous, one-shot attempt. Two layers enforce
// "no resume after leaving":
//
//  1. This server-side resume WINDOW (the trustworthy backstop). The attempt is
//     live only while it is still in_progress AND within a fixed window measured
//     from when it started (sessions.created_at, written when the attempt is
//     created). A page reload inside the window simply re-serves the live screen
//     (lenient on an accidental refresh); after the window, the server treats the
//     attempt as locked no matter what the browser claims. It is a plain
//     timestamp comparison: no timers, heartbeats, or background jobs.
//
//  2. A short-lived browser marker (the front-line UX, set in lib/submission's
//     liveMarkerKey). It survives a refresh but is cleared when the student
//     navigates away, so within the window it still distinguishes an accidental
//     refresh from a deliberate "leave and come back". Because layer 1 is
//     server-enforced, the no-resume guarantee does not depend on this marker:
//     tampering with it can at most let a student continue THEIR OWN attempt
//     within the window, never start a second one (a database unique index
//     forbids a second submission absolutely).
//
// The window is deliberately generous so a slow but honest attempt is never
// locked mid-conversation (the costly mistake). Lower it for a tighter bound on
// the dev-tools edge case.
export const SUBMISSION_LIVE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// The minimal shape the lock check needs from a session row.
type SubmissionLockInput = {
  kind: string;
  status: string;
  created_at: string;
};

// True when a graded submission's single attempt window has elapsed while still
// unfinished: the attempt is now locked (interrupted), not resumable. Practice
// sessions are never locked this way, and a submission that is already finished
// (completed/scored) is handled by its status, not by this check.
export function isSubmissionLocked(session: SubmissionLockInput): boolean {
  if (session.kind !== "submission") return false;
  if (session.status !== "in_progress") return false;
  const age = Date.now() - new Date(session.created_at).getTime();
  return age > SUBMISSION_LIVE_WINDOW_MS;
}

// The sessionStorage key for the front-line "I am in this live attempt" marker.
// Set by the Start assignment button just before opening the live screen.
export function liveMarkerKey(sessionId: string): string {
  return `relii-live-${sessionId}`;
}
