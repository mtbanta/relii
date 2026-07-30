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
// So an assignment unlocks at midnight UTC on the chosen day, and the date is
// read back in UTC everywhere, so a date picked as "Aug 14" always reads
// "Aug 14" on screen.

// Is this assignment still locked? True ONLY when a date is set AND that moment
// is still in the future. A null date (available now) or a date already passed
// is unlocked, and the assignment behaves exactly as it did before PD-3.
export function isLockedUntil(
  availableDate: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!availableDate) return false;
  const at = new Date(availableDate).getTime();
  // An unreadable value never locks a student out: the lock is a scheduling
  // convenience, so the safe failure is "open", not "nobody can work".
  if (Number.isNaN(at)) return false;
  return at > now;
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
