// PHASE 4a. THE INSTRUCTOR'S GRADE OVERRIDE, EVERYWHERE EXCEPT THE ROUTE.
//
// Two jobs live here, and both of them are the kind that must exist in exactly
// one place:
//
//   1. THE AI'S ORIGINAL SCORE. Reading it, and writing it exactly once.
//   2. TURNING A SET OF CHOSEN LEVELS INTO A SCORE, or refusing.
//
// The route below it (app/api/instructor/submission/[id]/review/route.ts) does
// the guard, the transaction and the HTTP. The retake branch of
// app/api/instructor/submission/[id]/reset/route.ts uses the reader half.
//
// ==> IT IMPORTS findLevel FROM lib/scoring.ts AND DOES NOT REIMPLEMENT IT.
//     Turning a level NAME into a rung of a ladder is the same question whether
//     a model or a professor answered it, and two pieces of code that decide
//     what a grade is worth will eventually disagree about one. The instructor
//     picks from a list of that criterion's own level names, so the forgiving
//     branches inside findLevel never fire for them; what matters here is the
//     strict half. A NAME THAT IS NOT ON THAT CRITERION'S LADDER IS A REFUSAL.
//     Nothing in this file falls back to a rung, picks a nearest one, or writes
//     a number the rubric did not state. <==
import { findLevel } from "@/lib/scoring";
import { MAX_REVIEW_NOTE_CHARS } from "@/lib/types";
import type { AdminClient } from "@/lib/class-scope";
import type { RubricCriterion, ScoreItem, SessionScore } from "@/lib/types";

// One line of what the browser sent: which criterion, which level, and the
// instructor's optional note.
export type ReviewInput = {
  id: string;
  level: string;
  note?: string;
};

// The same refusal shape lib/class-scope.ts and lib/instructor-submission.ts
// use, so the route hands any of them to the browser with one line.
export type Refusal = { ok: false; status: number; error: string };

// The AI's original score as it is stored: the whole itemised jsonb and the
// total that went with it.
export type AiOriginal = { score: SessionScore; scoreTotal: number | null };

function refuse(error: string, status = 400): Refusal {
  return { ok: false, status, error };
}

// ---------------------------------------------------------------------------
// 1. THE AI'S ORIGINAL SCORE.
// ---------------------------------------------------------------------------

// Read it, or null if this submission has never been reviewed.
export async function readAiOriginal(
  admin: AdminClient,
  sessionId: string,
): Promise<{ ok: true; original: AiOriginal | null } | Refusal> {
  const { data, error } = await admin
    .from("submission_ai_scores")
    .select("score, score_total")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("Reading the stored AI original failed:", sessionId, error);
    return refuse("Could not read the AI's original score.", 500);
  }
  if (!data) return { ok: true, original: null };
  return {
    ok: true,
    original: {
      score: data.score as SessionScore,
      scoreTotal: data.score_total as number | null,
    },
  };
}

// ==> WRITE IT IF IT IS NOT THERE, THEN READ BACK WHATEVER IS ACTUALLY STORED.
//     THE READ BACK IS NOT BELT AND BRACES, IT IS THE CORRECTNESS.
//
//     WHY THIS IS SAFE UNDER TWO SIMULTANEOUS FIRST SAVES, which is the case
//     worth writing out because it is the one that would quietly record an
//     overridden grade as though the AI had chosen it.
//
//     Call the two saves A and B. Both read sessions.score, both see the AI's
//     score, because neither has written anything yet. Both try to insert it.
//     One wins and one hits the unique constraint on session_id and does
//     nothing. THEY WERE INSERTING THE SAME VALUE, so which one won does not
//     matter. Both then read the row back and get that value.
//
//     NOW THE AWKWARD ORDERING. Suppose A is slow: B completes its whole save,
//     so sessions.score now holds B's OVERRIDDEN score, and only then does A
//     get here. A's candidate value is stale and wrong. It does not matter: B
//     already inserted, A's insert does nothing, and A READS BACK the AI's
//     score rather than using the value it brought with it. A route that built
//     its score from its own candidate instead of from the read would record
//     B's override as the AI's original, permanently.
//
//     AND THE GENERAL ARGUMENT, WHICH IS AN INDUCTION RATHER THAN A LIST OF
//     CASES. The only writers of sessions.score are the scorer (which writes
//     the AI's), this review path, and the retake restore (which puts the AI's
//     back). The review path NEVER updates the grade without first getting
//     through this function. So a value that is not the AI's could only be
//     inserted here by a call whose read of sessions.score already saw a review
//     applied, which needs an earlier review to have got through this function
//     first, which means the row already existed and this insert did nothing.
//     THE FIRST INSERT TO LAND IS THEREFORE ALWAYS THE AI'S SCORE. <==
export async function ensureAiOriginal(
  admin: AdminClient,
  submission: {
    id: string;
    class_id: string | null;
    assignment_id: string;
    student_id: string;
    score: SessionScore;
    score_total: number | null;
  },
): Promise<{ ok: true; original: AiOriginal } | Refusal> {
  const first = await readAiOriginal(admin, submission.id);
  if (!first.ok) return first;
  if (first.original) return { ok: true, original: first.original };

  const { error: insertError } = await admin
    .from("submission_ai_scores")
    .insert({
      session_id: submission.id,
      class_id: submission.class_id,
      assignment_id: submission.assignment_id,
      student_id: submission.student_id,
      score: submission.score,
      score_total: submission.score_total,
    });
  // 23505 is the unique constraint on session_id firing, which means another
  // save inserted the original a moment ago. That is not a failure, it is the
  // race above resolving correctly, and the read below picks up their row.
  if (insertError && insertError.code !== "23505") {
    console.error(
      "Recording the AI's original score failed:",
      submission.id,
      insertError,
    );
    return refuse(
      "Could not record the AI's original score, so nothing was changed.",
      500,
    );
  }

  const second = await readAiOriginal(admin, submission.id);
  if (!second.ok) return second;
  if (!second.original) {
    // The insert reported success (or a duplicate) and the row is not there.
    // Refusing is the only honest answer: applying the review now would put a
    // grade in place with no record of what it replaced.
    console.error(
      "The AI original vanished between the insert and the read:",
      submission.id,
    );
    return refuse(
      "Could not record the AI's original score, so nothing was changed.",
      500,
    );
  }
  return { ok: true, original: second.original };
}

// ---------------------------------------------------------------------------
// 2. TURNING CHOSEN LEVELS INTO A SCORE.
// ---------------------------------------------------------------------------

// The note, bounded. Trimmed first so trailing whitespace never costs somebody
// their last sentence, and an empty note becomes ABSENT rather than an empty
// string, so "is there a note" has one answer and not two.
function cleanNote(
  raw: unknown,
  which: string,
): { ok: true; note?: string } | Refusal {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== "string") {
    return refuse(`The note on "${which}" is not text.`);
  }
  const note = raw.trim();
  if (!note) return { ok: true };
  if (note.length > MAX_REVIEW_NOTE_CHARS) {
    return refuse(
      `The note on "${which}" is ${note.length} characters and the limit is ${MAX_REVIEW_NOTE_CHARS}. Please shorten it.`,
    );
  }
  return { ok: true, note };
}

// ==> THE SCORE IS BUILT BY WALKING THE STORED ITEMS, NOT THE RUBRIC, AND THE
//     DIRECTION IS THE SAME RULING components/rubric-score.tsx ALREADY MAKES.
//     The stored score is the record of what was actually graded; the rubric is
//     looked up only to price a level. Walking the rubric would silently DROP a
//     stored item whose criterion is no longer in it, which is a student's mark
//     disappearing from their own results page. Here an item the rubric can no
//     longer explain is a REFUSAL rather than a drop, because unlike the
//     read-only renderer this function is about to write a grade, and a grade
//     that quietly loses a line is worse than one that will not save.
//
//     IT ALSO MAKES THE RE-EDIT PROOF EXACT. Putting every level back to the
//     AI's produces an item list with the same ids in the same order and the
//     same points, so "the AI original is unchanged" is a comparison of two
//     values rather than an argument about two code paths. <==
export function buildReviewedScore(args: {
  // What is stored on the session right now. On a first review this is the
  // AI's; on a re-edit it is the previous review's.
  stored: SessionScore;
  // What the AI originally said. THE COMMENTS AND THE "did this change" TEST
  // BOTH COME FROM HERE, never from `stored`: across re-edits only the original
  // stays true, and a chain of copies of a copy is how a comment drifts away
  // from the judgment it was written about.
  original: SessionScore;
  // The assignment's rubric criteria, which is where a level's points live.
  criteria: RubricCriterion[];
  // What the browser sent.
  input: unknown;
}): { ok: true; score: SessionScore } | Refusal {
  const { stored, original, criteria, input } = args;

  if (!Array.isArray(input)) {
    return refuse("The review was not sent in the expected form.");
  }

  const criterionById = new Map(criteria.map((c) => [c.id, c]));
  const originalById = new Map(original.items.map((i) => [i.id, i]));

  // A readable name for one line, for the refusal messages. The rubric's name
  // where there is one, the internal id where there is not, because naming the
  // thing that is wrong is the difference between a message an instructor can
  // act on and one they have to guess at.
  const nameOf = (id: string) => criterionById.get(id)?.name ?? id;

  // ==> THE ITEM SET MUST BE EXACT: EVERY STORED CRITERION, EXACTLY ONCE, AND
  //     NOTHING ELSE. This is the same principle as the scorer refusing a reply
  //     that omitted a criterion. A partial save would write a grade that is
  //     missing a line while looking like a complete one, and the total
  //     underneath it would be arithmetically correct for the wrong set of
  //     criteria, which is the worst kind of wrong number: a consistent one. <==
  const sent = new Map<string, ReviewInput>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      return refuse("The review was not sent in the expected form.");
    }
    const entry = raw as Partial<ReviewInput>;
    if (typeof entry.id !== "string" || !entry.id) {
      return refuse("The review has a line with no criterion on it.");
    }
    if (sent.has(entry.id)) {
      return refuse(`The review names "${nameOf(entry.id)}" more than once.`);
    }
    sent.set(entry.id, entry as ReviewInput);
  }

  const storedIds = new Set(stored.items.map((i) => i.id));
  for (const id of sent.keys()) {
    if (!storedIds.has(id)) {
      return refuse(
        `The review names "${nameOf(id)}", which is not part of this submission's score.`,
      );
    }
  }

  const items: ScoreItem[] = [];
  for (const item of stored.items) {
    const entry = sent.get(item.id);
    if (!entry) {
      return refuse(`The review is missing the criterion "${nameOf(item.id)}".`);
    }

    const criterion = criterionById.get(item.id);
    if (!criterion) {
      return refuse(
        `This submission was graded on "${item.id}", which is not in the assignment's rubric, so its level cannot be looked up. This score cannot be reviewed.`,
      );
    }

    // THE ONE LOOKUP, shared with the scorer. An unmatched level refuses.
    const chosen = findLevel(criterion, entry.level);
    if (!chosen) {
      return refuse(
        `"${String(entry.level)}" is not one of the performance levels on "${criterion.name}".`,
      );
    }

    const note = cleanNote(entry.note, criterion.name);
    if (!note.ok) return note;

    const aiItem = originalById.get(item.id);
    if (!aiItem) {
      return refuse(
        `The AI's original score has no line for "${criterion.name}", so this review cannot say what was changed.`,
        500,
      );
    }

    // ==> CHANGED MEANS THE LEVEL DIFFERS FROM THE AI'S, AND IT IS RECOMPUTED
    //     FROM THE ORIGINAL EVERY TIME RATHER THAN CARRIED FORWARD. Putting a
    //     level back to the AI's choice puts this back to "ai", which is what
    //     makes the marker describe the CURRENT disagreement rather than the
    //     history of one. A note is not a change: it is always the instructor's
    //     by construction, so it needs no marker of its own.
    //
    //     A missing level on the AI's line (a score from before Phase 2b-1)
    //     counts as changed. That direction is deliberate: it can only ever
    //     label a line as the instructor's when it was not, and never hide a
    //     real override. Such a score cannot reach here anyway, because it
    //     belongs to an assignment with no rubric and the route refuses those. <==
    const changed = aiItem.level !== chosen.name;

    items.push({
      id: item.id,
      level: chosen.name,
      // ==> STRAIGHT OUT OF THE RUBRIC, exactly as the scorer takes it. The
      //     instructor picked a LEVEL and never a number, so there is nothing
      //     here to clamp and nothing to round. Half points are real. <==
      points_earned: chosen.points,
      points_max: criterion.levels[0].points,
      // THE AI'S COMMENT STAYS, taken from the ORIGINAL rather than from the
      // stored score, so it is the same words the AI wrote about the level it
      // chose however many times this has been re-edited.
      comment: aiItem.comment,
      ...(note.note ? { instructor_note: note.note } : {}),
      scored_by: changed ? "instructor" : "ai",
    });
  }

  // Every value in Tom's rubrics is a whole number or a half, and one half is
  // exactly representable in binary floating point, so this sum is exact and
  // needs no rounding to tidy it. Do not add one. Same line, same reason, as
  // the scorer's own total.
  const total = items.reduce((sum, i) => sum + i.points_earned, 0);

  // ==> max_total IS CARRIED OVER FROM THE STORED SCORE AND IS NEVER RECOMPUTED
  //     HERE. It is the maximum the rubric STATED when this submission was
  //     graded. Re-deriving it from the rubric would be a second way to reach a
  //     number the record already holds, and a review must never be able to
  //     move the denominator under a student: the instructor is changing which
  //     rung was earned, not what the assignment was out of. <==
  return { ok: true, score: { total, max_total: stored.max_total, items } };
}
