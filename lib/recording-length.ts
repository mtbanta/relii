// PD-5: the Recording Length of ONE practice or ONE submission.
//
// WHAT THE NUMBER MEANS (the locked rule, in one place so every screen agrees):
//   - A voice + video session with the CAMERA ON, so a recording exists: the
//     length of that recording.
//   - Everything else (a text session, or a voice + video session where the
//     student declined the camera so there is no recording): the elapsed
//     conversation time, start to end.
// It is always the length of that ONE session. It is never a running total
// across a student's attempts, and nothing here ever adds two sessions together.
//
// The number itself is measured when the session ends and stored on the session
// row as recorded_seconds (supabase/pd-5-recorded-seconds.sql). This file only
// turns that stored number into something to put on screen.

// The exact wording every screen uses. Kept here so the four placements cannot
// drift apart.
export const RECORDING_LENGTH_LABEL = "Recording Length";

// What we show when there is no stored length. Sessions finished before PD-5
// shipped were never measured, and an estimate from the timestamps we happen to
// have would be inflated for a voice session (the student can sit on the "Start
// call" screen for as long as they like before the meeting begins). An honest
// blank beats a wrong number, so those rows show this.
export const RECORDING_LENGTH_EMPTY = "-";

// mm:ss for a stored length in seconds. Returns null when there is no usable
// number, so a caller that wants its own wording for the empty case can have it.
// Minutes are not wrapped into hours: a 65 minute session reads "65:03", which
// is right for a role-play that is never meant to run past 30 minutes anyway.
export function formatRecordingLength(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null) return null;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  if (seconds < 0) return null;
  const whole = Math.floor(seconds);
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// The same thing for the common case: mm:ss, or the dash when we have nothing.
export function recordingLengthText(seconds: number | null | undefined): string {
  return formatRecordingLength(seconds) ?? RECORDING_LENGTH_EMPTY;
}

// Turn a measured span of milliseconds into the whole seconds we store. Used by
// the browser when it measures a call, and by the server for its fallback.
// Floors (a 59.8 second call is 59 seconds, not a minute) and never goes below
// zero, which is also what the database check constraint allows.
export function msToRecordedSeconds(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

// Is this a number we are willing to store? The browser sends the measured
// length to the server, and the server refuses anything that is not a sane whole
// count of seconds rather than trusting it. The upper bound is a sanity ceiling,
// not a rule about meetings: 24 hours is far past anything real, so a value
// beyond it means something went wrong, not that a student talked that long.
const MAX_RECORDED_SECONDS = 24 * 60 * 60;

export function isUsableRecordedSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_RECORDED_SECONDS
  );
}
