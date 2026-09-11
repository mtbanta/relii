// PD-5: the "date taken" of a session, formatted ONE way for everybody.
//
// The instructor's submission view has shown this date for a while. PD-5 brings
// the same date to the student's own view of a practice or submission, and the
// point of the exercise is that the two agree, so the formatting lives here
// instead of being written out twice and drifting apart later.
//
// WHICH TIMESTAMP IS "TAKEN"
// A graded submission has submitted_at, the official moment it was handed in,
// and that is the date the instructor view has always shown. A practice is never
// submitted, so it has no such stamp; its date is created_at, the moment the
// student started it, which is already the date the student home lists it under.
// dateTaken picks whichever applies, so a caller does not have to care which
// kind of session it is holding.
import { formatInstant } from "@/lib/app-time";

// A stored timestamp shown as a plain date and time (e.g. "Jul 30, 2026, 2:14 PM").
// US Central, like every other timestamp in the app; see lib/app-time.ts.
export function formatDateTaken(value: string | null): string | null {
  return formatInstant(value);
}

// The date to show for a session: when it was submitted if it ever was,
// otherwise when it was started.
export function dateTaken(session: {
  submitted_at?: string | null;
  created_at?: string | null;
}): string | null {
  return formatDateTaken(session.submitted_at ?? session.created_at ?? null);
}
