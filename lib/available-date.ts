// The Available Date rule, in ONE place so the student home and the server
// routes cannot drift apart.
//
// An assignment's available_date is when it UNLOCKS for students. It is a new
// field alongside the existing due date (due_at is not repurposed and is not
// read here). An EMPTY available date means AVAILABLE NOW, which is why every
// assignment created before PD-3 keeps working and appears immediately.
//
// Dates are stored as midnight UTC, exactly the way due_at already is: the date
// picker sends a plain day like "2026-08-14" and the database reads it in UTC.
// The date is read back in UTC for DISPLAY everywhere, so a date picked as
// "Aug 14" always reads "Aug 14" on screen.
//
// ==> THE UNLOCK IS NOT MIDNIGHT UTC ANY MORE. Owner's ruling, 2026-09-11: an
//     assignment unlocks at 12:00 AM CENTRAL on the picked day. Until then it
//     unlocked at midnight UTC, which is 7pm Central the EVENING BEFORE, so an
//     assignment dated "Sep 14" opened itself on the 13th while still telling
//     the student it was not available until the 14th. The date shown and the
//     lock now name the same day, which is the whole of the fix.
//
//     THE PICKED DAY IS STILL READ IN UTC, by startOfAppDay in lib/app-time.ts,
//     which is the same read formatAvailableDate below does. That is deliberate
//     and it is what keeps the two halves agreeing: the day comes from the
//     stored value the same way for both, and only the MOMENT that day begins
//     is new.
import { startOfAppDay } from "@/lib/app-time";

// Is this assignment still locked? True ONLY when a date is set AND 12:00 AM
// Central on that day is still in the future. A null date (available now) or a
// day already begun is unlocked, and the assignment behaves as it did before.
export function isLockedUntil(
  availableDate: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!availableDate) return false;
  const unlocksAt = startOfAppDay(availableDate);
  // An unreadable value never locks a student out: the lock is a scheduling
  // convenience, so the safe failure is "open", not "nobody can work".
  // startOfAppDay returns null for both an empty and an unreadable value.
  if (unlocksAt === null) return false;
  return unlocksAt > now;
}

// Show a stored available date as a plain date (read in UTC so a date picked as
// "Aug 14" always shows as "Aug 14"). Mirrors how the due date is formatted.
export function formatAvailableDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
