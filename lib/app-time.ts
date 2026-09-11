// EVERY HUMAN-READABLE DATE AND TIME IN THIS APP, IN ONE TIMEZONE, FROM ONE
// CONSTANT.
//
// The owner's ruling of 2026-09-11: the whole app reads US Central, on screen
// and in downloaded files, with NO per-viewer timezone and NO " UTC" suffix.
// Before this file existed, most formatting call sites passed no timeZone at
// all, which meant the date was decided by whatever machine happened to run the
// code: the Vercel runtime for a server component (UTC), the student's own
// laptop for anything in the browser. A grade saved at 10:21 PM Central printed
// as "Sep 11, 2026, 3:21 AM", a day out, which is the defect this file closes.
//
// ==> THE POINT IS THE SINGLE CONSTANT, NOT THE FUNCTIONS. If Relii ever needs
//     a second timezone, this is the one line to change, and nothing else in
//     the app names a zone at all. A find-and-replace across nine call sites is
//     exactly what this project keeps paying for.
//
// ==> WHAT IS DELIBERATELY *NOT* HERE, AND WHY. Four functions elsewhere format
//     a DATE-ONLY value and are correctly pinned to UTC. They must not be moved
//     here and must not be changed:
//
//       formatDueDate       app/student/page.tsx
//       formatDueDate       components/edit-assignment-form.tsx
//       formatAvailableDate lib/available-date.ts
//       toDateInputValue    components/edit-assignment-form.tsx
//
//     A due date or an available date has no time on it. The date picker sends
//     a plain day and the database stores it as midnight UTC, so reading it
//     back in UTC is what makes a date picked as "Sep 14" always read "Sep 14".
//     Read those in Central and midnight UTC becomes 7pm the evening before,
//     and every existing date in the app silently moves back a day. That is
//     ruling 4, and it is the opposite answer from the one this file gives.
//
//     SO THE FUNCTION NAMES BELOW ALL SAY "Instant". An instant is a stored
//     moment with an hour on it; a date-only value is a calendar day with no
//     moment at all. Two functions that both turn a timestamp-shaped string
//     into "Sep 14, 2026" but disagree about which day that is are precisely
//     the kind of pair this repo has already been bitten by twice, so the
//     distinction is carried in the names rather than in a comment somebody
//     has to find.

// THE ONE CONSTANT. Every human-readable date in Relii resolves through this.
export const APP_TIME_ZONE = "America/Chicago";

// Intl is asked for the zone EXPLICITLY on every call, so the answer never
// depends on the machine: a Vercel server, a developer's laptop and a student's
// browser all produce the same string. That is also what keeps a client
// component from hydrating differently than it rendered.
//
// The formatters are built once and reused, because constructing an
// Intl.DateTimeFormat is the expensive part and these run in render paths.

// "Sep 11, 2026, 10:21 PM"
const INSTANT = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// "Jun 9"
const INSTANT_SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
});

// "Sep 11, 2026"
const INSTANT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

// The calendar parts of an instant, in Central. hourCycle "h23" is not a style
// choice: with hour12:false some ICU builds report midnight as hour "24", which
// would make the day stamp and the day-start arithmetic below wrong for exactly
// one hour a day, which is the worst kind of wrong to go looking for.
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

// What a wall clock in Central reads at this instant.
function wallClock(instant: Date): Wall {
  const got: Record<string, string> = {};
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== "literal") got[part.type] = part.value;
  }
  return {
    year: Number(got.year),
    month: Number(got.month),
    day: Number(got.day),
    hour: Number(got.hour),
    minute: Number(got.minute),
    second: Number(got.second),
  };
}

// How far Central is behind UTC at this instant, in milliseconds. Positive,
// because Central is west of UTC: +5 hours on daylight time, +6 on standard
// time. This is READ FROM Intl rather than hard-coded, which is the whole
// reason daylight saving needs no calendar of its own here.
function offsetMs(instant: number): number {
  const w = wallClock(new Date(instant));
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return instant - asIfUtc;
}

// A stored timestamp as a plain date and time, e.g. "Sep 11, 2026, 10:21 PM".
export function formatInstant(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return INSTANT.format(at);
}

// A stored timestamp as a short month and day, e.g. "Jun 9".
export function formatInstantShortDay(value: string): string {
  return INSTANT_SHORT_DAY.format(new Date(value));
}

// A stored timestamp as a plain date, e.g. "Sep 11, 2026". The CENTRAL day of
// that moment, which is not the same thing as a date-only value read in UTC.
export function formatInstantDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return INSTANT_DAY.format(at);
}

// The Central calendar day of an instant as "YYYY-MM-DD", for filenames that
// sort by date. A submission handed in at 10pm Central on the 10th belongs in a
// file named for the 10th, not the 11th, which is what the UTC day would say.
export function instantDayStamp(instant: Date): string {
  const w = wallClock(instant);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

// ==> THE UNLOCK. The exact moment 12:00 AM Central begins on the day a stored
//     date-only value names, as milliseconds since the epoch.
//
//     The stored value is midnight UTC of the picked day, so the picked day is
//     its UTC calendar day. That is READ THE SAME WAY formatAvailableDate reads
//     it, on purpose: the date the student is shown and the moment the lock
//     lifts have to name the same day, or the app is lying on one of the two.
//
//     TWO PASSES. The first asks what Central's offset was at midnight UTC on
//     that day, which lands within a few hours of the answer. The second asks
//     again at that candidate instant, in case the day's own midnight sits on
//     the far side of a clock change from the evening before it.
//
//     BE HONEST ABOUT THE SECOND PASS: FOR AMERICA/CHICAGO IT NEVER CHANGES THE
//     ANSWER, and it was measured rather than assumed. This zone switches at
//     2 AM local on a Sunday, and midnight UTC on any day is 6 or 7pm the
//     PREVIOUS EVENING in Chicago, so the two samples always sit on the same
//     side of any transition. It is kept because the constant at the top of this
//     file is meant to be the only line anybody edits, and zones that switch at
//     midnight local (America/Santiago, for one) do exist, where a one-pass
//     answer would be an hour wrong twice a year. A reader should not mistake it
//     for a guard that fires today.
//
//     Returns null for an empty or unreadable value; the caller decides what
//     that means.
export function startOfAppDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const stored = new Date(value);
  if (Number.isNaN(stored.getTime())) return null;

  const utcMidnight = Date.UTC(
    stored.getUTCFullYear(),
    stored.getUTCMonth(),
    stored.getUTCDate(),
  );

  const firstPass = utcMidnight + offsetMs(utcMidnight);
  const secondOffset = offsetMs(firstPass);
  return utcMidnight + secondOffset;
}
