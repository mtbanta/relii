// POST /api/instructor/submission/<id>/review
// Body: { items: [{ id, level, note }] }
//
// PHASE 4a. THE INSTRUCTOR'S GRADE OVERRIDE, AND MARK REVIEWED. One route does
// both, because they are the same action: confirming the AI's score unchanged is
// a review whose chosen levels happen to be the ones already there, and Tom
// pressing one button on a score he agrees with is the COMMON case rather than a
// special one.
//
// ==> WHY THIS EXISTS AT ALL, IN ONE SENTENCE: Phase 2c showed the AI's chosen
//     level can be wrong in ways worth auditing, so the override is the safety
//     net under every grade, not a convenience. <==
//
// THE FIVE RULES IT ENFORCES, ALL SERVER SIDE:
//
//   1. THE INSTRUCTOR PICKS A LEVEL, NEVER A NUMBER. The body carries level
//      NAMES. Points are looked up from the rubric here, through the same
//      findLevel() the scorer uses. There is no zero, no value off the ladder,
//      and Tom's 10 per cent floor is untouched, because every number written
//      came out of his own file.
//   2. A LEVEL THAT IS NOT ON THAT CRITERION'S LADDER IS REFUSED. Nothing falls
//      back to a rung.
//   3. THE ITEM SET IS EXACT: every criterion of the stored score, once each,
//      nothing else. A missing, duplicated or unknown line is refused by name.
//   4. THE AI'S ORIGINAL IS RECORDED BEFORE ANYTHING IS CHANGED, once, in a
//      table no student can read, and a later save can never overwrite it.
//   5. EVERY SAVE IS LOGGED, AND THE LOG AND THE GRADE MOVE TOGETHER. That is
//      one database function under a row lock, because PostgREST cannot wrap two
//      writes in a transaction and "every save is logged" is a ruling rather
//      than an aspiration.
//
// ==> IT NEVER TOUCHES sessions.status. A reviewed submission is still 'scored'.
//     Adding a fourth status would make lib/assignment-sessions.ts stop being
//     total and would break seventeen code sites that key on 'scored'. Reviewed
//     is a COLUMN (sessions.reviewed_at), written by the function below. <==
//
// ==> AND IT CAN NEVER REACH A PRACTICE. loadInstructorSubmission() reads with
//     .eq("kind", "submission"), so a practice session id gets the same 404 a
//     stranger's submission does. Practices are never reviewed. <==
import { NextResponse } from "next/server";
import { loadInstructorSubmission } from "@/lib/instructor-submission";
import type { SubmissionWording } from "@/lib/instructor-submission";
import { buildReviewedScore, ensureAiOriginal } from "@/lib/submission-review";

// The two refusals in the shared guard that name an action. Everything else it
// says ("Not signed in.", "Submission not found.") is already right for a
// review, and the 404 wording is deliberately identical to the download routes'
// so that a caller still cannot tell "does not exist" from "is not yours".
const REVIEW_WORDING: SubmissionWording = {
  action: "review submissions",
  noClass:
    "Your instructor account is not linked to a class, so submissions cannot be reviewed.",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ==> ONE GUARD, THE SAME ONE THE DOWNLOAD ROUTES USE, AND THIS ROUTE GOES
  //     THROUGH IT RATHER THAN AROUND IT. It answers all four questions that
  //     matter here in one place: signed in, an instructor (read from the
  //     database, never trusted from the browser), working in a class, and this
  //     submission is IN that class and is a submission rather than a practice.
  //     Writing those checks out again in this file would be a second place
  //     that decides who may act on a submission, and two such places drift. <==
  const loaded = await loadInstructorSubmission(id, REVIEW_WORDING);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const {
    admin,
    callerId,
    callerEmail,
    submission,
    studentEmail,
    criteria,
    rubricAttached,
  } = loaded.data;

  // 1. There has to be a grade to review.
  if (submission.status !== "scored" || !submission.score) {
    return NextResponse.json(
      {
        error:
          "This submission has no score yet, so there is nothing to review.",
      },
      { status: 409 },
    );
  }
  const stored = submission.score;
  if (!Array.isArray(stored.items) || stored.items.length === 0) {
    return NextResponse.json(
      { error: "This submission's score has no criteria, so it cannot be reviewed." },
      { status: 409 },
    );
  }

  // ==> 2. THE LEGACY CASE, AND IT IS A REFUSAL IN PLAIN WORDS RATHER THAN A
  //     CRASH. 32 stored scores predate performance levels, and their
  //     assignments carry no rubric. With no rubric there is no ladder, so
  //     there is no honest way to price a level, and the review editor does not
  //     render for them either. The two must agree: a screen that hides a
  //     control while the route behind it would have accepted the request is a
  //     rule enforced by nothing. <==
  if (!rubricAttached || criteria.length === 0) {
    return NextResponse.json(
      {
        error:
          "This assignment has no rubric attached, so there are no performance levels to choose from and this score cannot be reviewed.",
      },
      { status: 409 },
    );
  }

  // 3. The body.
  let items: unknown = undefined;
  try {
    const body = await request.json();
    items = body?.items;
  } catch {
    // Fall through: buildReviewedScore refuses anything that is not a list.
  }

  // ==> 4. RECORD WHAT THE AI SAID, BEFORE ANYTHING IS CHANGED AND BEFORE THE
  //     NEW SCORE IS EVEN BUILT. The order is the whole safety of it. On the
  //     first review sessions.score still holds the AI's own grade, so this is
  //     the last moment it can be captured; do it after the update and the
  //     record would be of the override rather than of the original. On every
  //     later save the row is already there, the insert does nothing, and what
  //     comes back is still the AI's. See ensureAiOriginal() for why that holds
  //     even when two saves land at the same instant. <==
  const original = await ensureAiOriginal(admin, {
    id: submission.id,
    class_id: submission.class_id,
    assignment_id: submission.assignment_id,
    student_id: submission.student_id,
    score: stored,
    score_total: submission.score_total,
  });
  if (!original.ok) {
    return NextResponse.json(
      { error: original.error },
      { status: original.status },
    );
  }

  // 5. Build the new score, or refuse. Every refusal from here names the thing
  //    that is wrong, because an instructor mid-grading needs to know which
  //    criterion to look at.
  const built = buildReviewedScore({
    stored,
    original: original.original.score,
    criteria,
    input: items,
  });
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: built.status });
  }

  // ==> 6. THE LOG ROW AND THE GRADE, IN ONE TRANSACTION, UNDER A ROW LOCK ON
  //     THE SESSION. This is a database function and not two calls from here
  //     because PostgREST has no way to wrap two writes in one transaction.
  //     Without it, a failure between them would either log a review that never
  //     landed or, far worse, change a student's grade with no record of who
  //     did it. It also re-reads kind and status under the lock, so an "Allow
  //     retake" landing in the gap between the guard above and this write
  //     cannot have the review write a grade onto a row that is now a practice
  //     back in the student's pool.
  //
  //     The function is granted to service_role only. Every argument it needs is
  //     supplied from here, already checked: it validates nothing and decides
  //     nothing, exactly like create_assignment_with_rubric(). <==
  // ==> IT IS HANDED THE SESSION ID AND NOT THE CLASS, THE ASSIGNMENT OR THE
  //     STUDENT. The function reads those three off the row it has locked,
  //     because the log row's class_id decides whether a class export contains
  //     it, and a value this route passed in is a second source for an answer
  //     the row already holds. The student's EMAIL is still passed, because that
  //     is a snapshot of a label rather than a routing value: it is read above
  //     from the profile of that same student_id. <==
  const { error: saveError } = await admin.rpc("save_submission_review", {
    p_session_id: submission.id,
    p_student_email: studentEmail,
    p_instructor_id: callerId,
    p_instructor_email: callerEmail ?? "unknown",
    p_score: built.score,
    // ==> BOTH GRADE FIELDS COME FROM ONE VALUE HERE, AND THAT IS NOT AN
    //     INCONSISTENCY WITH ensureAiOriginal() ABOVE, WHICH TAKES score_total
    //     FROM THE COLUMN. The two are doing different jobs. The snapshot
    //     RECORDS what was in force, so it copies the column that held it. This
    //     WRITES a new grade, so the number and the jsonb it must agree with are
    //     computed once, in buildReviewedScore(), and travel together. A second
    //     derivation here is exactly how the dashboard and the student home
    //     would come to show different totals for one student. <==
    p_score_total: built.score.total,
  });
  if (saveError) {
    // R0001 is the function's own stop under the lock: the row changed while
    // this request was in flight and is no longer a scored submission, most
    // likely because an Allow retake landed. That is a conflict rather than a
    // fault, and it gets its own message so an instructor is told to reload
    // rather than to try the same thing into the same wall.
    if (saveError.code === "R0001") {
      console.warn("A review lost a race with another change:", id, saveError.message);
      return NextResponse.json(
        {
          error:
            "This submission changed while you were reviewing it. Reload the page and look again before saving.",
        },
        { status: 409 },
      );
    }
    // ==> R0002 IS THE FUNCTION REFUSING TO MOVE A GRADE WITH NO RECORD OF WHAT
    //     THE AI ORIGINALLY SAID. It should be unreachable from this route,
    //     because ensureAiOriginal() above returns its own 500 rather than
    //     falling through. Reaching it means those two disagreed, which is
    //     exactly the case where continuing would destroy the original forever,
    //     so it is reported as a fault and not smoothed over. <==
    if (saveError.code === "R0002") {
      console.error(
        "The review function refused: no AI original is recorded for",
        id,
        saveError.message,
      );
      return NextResponse.json(
        {
          error:
            "The AI's original score is not recorded for this submission, so its grade was not changed. Reload the page and try again.",
        },
        { status: 500 },
      );
    }
    console.error("Saving the review failed:", id, saveError);
    return NextResponse.json(
      { error: "Could not save this review. Nothing was changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
