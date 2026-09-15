// The per-assignment persona voice (T1).
//
// An instructor picks which of two voices the AI persona speaks in, on the
// assignment, beside the meeting length. It is stored as assignments.voice.
//
// THIS FILE IS THE SINGLE PLACE THE VOICE NAMES LIVE. Both instructor forms,
// the create route, and lib/realtime.ts all read them from here, so adding or
// renaming a voice is a change in one file. It deliberately imports nothing
// server-side, because the two instructor forms run in the browser.
//
// WHY IT IS ON THE ASSIGNMENT AND NOT ON THE PERSONA. One scenario can back
// many assignments (assignments.scenario_id has an index and no uniqueness
// rule). A voice stored on the scenario but chosen on the assignment form would
// mean that creating a second assignment on Alex and picking the other voice
// silently changed the first assignment's voice too. Storing the value where it
// is chosen is what makes that impossible.
//
// A NULL VOICE MEANS CEDAR. Every assignment created before T1 has no value
// stored, so every one of them keeps sounding exactly as it does today. So does
// a session with no assignment at all: there are 25 such rows, from before a
// practice was always a practice FOR an assignment, and resolvePersonaVoice()
// below is what keeps them working rather than failing.

// The two voices, and the labels an instructor sees. The values are the names
// OpenAI's realtime API uses; the labels say which is male and which is female,
// because that is the difference an instructor is actually choosing between.
//
// ==> BOTH VALUES WERE CONFIRMED ACCEPTED BY THE LIVE API BEFORE THEY SHIPPED,
//     on the model getRealtimeModel() returns, rather than read off a
//     documentation page. That is not caution for its own sake: D3 lost a
//     session to "languages", a field every current OpenAI doc page describes,
//     which this app's model answers with HTTP 400. A voice string the API
//     refuses fails down exactly the same path, and
//     app/api/voice/token/route.ts turns it into a 502, which is NO VOICE AT
//     ALL for the student rather than a wrong-sounding one.
//
//     ANY THIRD VOICE ADDED HERE MUST BE MEASURED THE SAME WAY FIRST, and the
//     check constraint in supabase/t1-persona-voice.sql has to be widened to
//     match or the database will refuse it. <==
export const PERSONA_VOICES = [
  { value: "cedar", label: "Cedar (M)" },
  { value: "marin", label: "Marin (F)" },
] as const;

export type PersonaVoice = (typeof PERSONA_VOICES)[number]["value"];

// What an unset (null) voice means. Also the voice the whole app used before
// T1, which is why nothing legacy had to be backfilled.
export const DEFAULT_PERSONA_VOICE: PersonaVoice = "cedar";

// Turn whatever is stored on the assignment into a voice the API will accept.
// Null, missing, or anything not on the list above falls back to the default,
// so a voice session ALWAYS has a usable voice: this can never return null and
// leave a student with no audio. The database carries the same rule as a check
// constraint, so an unknown value should be unreachable; this is the belt to
// that braces, and it is what makes a session with no assignment work.
export function resolvePersonaVoice(
  voice: string | null | undefined,
): PersonaVoice {
  const match = PERSONA_VOICES.find((option) => option.value === voice);
  return match ? match.value : DEFAULT_PERSONA_VOICE;
}
