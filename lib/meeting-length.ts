// The per-assignment meeting length (PD-4).
//
// An instructor picks how long the role-play meeting runs, from 5 to 30 minutes,
// on the assignment. That number is what the student's practice clock counts up
// to: the clock still starts at 00:00 and counts UP, and when it reaches this
// length the practice automatically ends through the student's normal End
// routine. It is stored as assignments.duration_minutes.
//
// THIS FILE IS THE SINGLE PLACE THE NUMBERS LIVE. The clock, the student session
// page, and both instructor forms all read them from here, so retuning the
// allowed range or the fallback is a one-line change in one file.
//
// A NULL DURATION MEANS 30. Every assignment created before PD-4 has no value
// stored, and an instructor can still leave the field blank on purpose. Both
// read as the standard 30 minute meeting, which is exactly how the app behaved
// before this piece, so nothing legacy had to be backfilled.

// The shortest and longest meeting an instructor can choose. The database says
// the same thing (a check constraint in supabase/pd-4-meeting-length.sql), so a
// value outside this range cannot get in by any route.
export const MIN_MEETING_MINUTES = 5;
export const MAX_MEETING_MINUTES = 30;

// What an unset (null) duration means. Also the value the whole app used before
// PD-4, which is why legacy assignments keep working untouched.
export const DEFAULT_MEETING_MINUTES = 30;

// Turn whatever is stored on the assignment into the number of minutes the clock
// should run for. Null, missing, or anything that is not a usable number falls
// back to the default, so a practice ALWAYS has a working auto-end: this can
// never return null and leave a practice running forever. Out-of-range values
// (which the form and the database both prevent) are clamped rather than
// trusted.
export function resolveMeetingMinutes(
  durationMinutes: number | null | undefined,
): number {
  if (typeof durationMinutes !== "number" || !Number.isFinite(durationMinutes)) {
    return DEFAULT_MEETING_MINUTES;
  }
  const whole = Math.round(durationMinutes);
  if (whole < MIN_MEETING_MINUTES) return MIN_MEETING_MINUTES;
  if (whole > MAX_MEETING_MINUTES) return MAX_MEETING_MINUTES;
  return whole;
}
