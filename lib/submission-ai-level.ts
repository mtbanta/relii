// PHASE 4b. WHAT GOES IN THE CSV'S "AI level" COLUMN, AND NOTHING ELSE.
//
// ==> WHY THIS IS ITS OWN FILE RATHER THAN A TERNARY INSIDE THE ROUTE. It is
//     four branches deciding what a grade export says the AI awarded, and it is
//     the one place in Phase 4b where the file could state something nobody
//     ever chose. A route handler cannot be imported and executed on its own
//     (Next.js App Router allows only GET, POST and friends to be exported from
//     a route file), so a rule that lives inside one can only be read, never
//     run. Here it can be run, and scripts/check-csv-ai-level.mjs runs it
//     against all four states plus the shapes that have bitten this project
//     before.
//
// ==> THE RULE IN ONE SENTENCE: THE CELL IS EITHER WHAT THE AI ACTUALLY CHOSE,
//     OR IT IS BLANK. It is never a guess, never a nearest value, and never the
//     instructor's own choice wearing the AI's name. Nobody reading a grade
//     export can tell a fabricated cell from a real one, which is exactly why
//     there must not be one.
import type { ScoreItem, SessionScore } from "@/lib/types";

export type AiLevelInputs = {
  // The line as it is stored on the session RIGHT NOW. After a review this is
  // the instructor's; before one it is the AI's.
  item: ScoreItem;
  // The AI's recorded original, or null when none is on record. Null means one
  // of two very different things, which is why reviewedAt is also needed.
  original: SessionScore | null;
  // sessions.reviewed_at. Non-null means somebody has overruled or confirmed
  // this score at least once.
  reviewedAt: string | null;
  // True when the READ of the original failed, as opposed to finding nothing.
  // "could not look" and "looked and there is nothing" are different facts and
  // they produce different files.
  unreadable: boolean;
};

export function aiLevelFor({
  item,
  original,
  reviewedAt,
  unreadable,
}: AiLevelInputs): string {
  // 1. THE ORIGINAL IS ON RECORD. It is the only source for this column, and it
  //    is used whatever the current Level says. If it somehow carries no line
  //    for this criterion, BLANK: falling through to the stored level would
  //    print the instructor's own choice under the AI's name.
  if (original) {
    return original.items.find((i) => i.id === item.id)?.level ?? "";
  }
  // 2. THE READ FAILED. We do not know what the AI chose, so we do not say.
  if (unreadable) return "";
  // 3. NO ORIGINAL, AND NOBODY HAS REVIEWED IT. An unreviewed score IS the
  //    AI's, so the stored level is the AI's level. This is not a fallback: it
  //    is the same fact read from the place it is kept. A score with no level
  //    at all (the 32 rows that predate ScoreItem.level) stays blank here
  //    exactly as it does in the Level column beside it.
  if (reviewedAt === null) return item.level ?? "";
  // 4. REVIEWED, WITH NO ORIGINAL ON RECORD. The state 4a's editor and its
  //    retake both refuse to create. If it ever exists, the AI's own choice is
  //    gone and nothing can reconstruct it, so the cell is blank and the file's
  //    header block says why in words.
  return "";
}
