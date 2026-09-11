// POST /api/instructor/submission/<id>/reset
// Body: { type: "interrupted" | "retake" }
//
// An instructor-only control that clears ONE graded submission so the student
// can start/submit that assignment again. There are two paths, and the route
// re-verifies (server-side, never trusting the browser) that the target session
// actually qualifies for the path requested:
//
//   type = "interrupted"  (low stakes): recover a stuck attempt. Requires a
//     submission that is genuinely locked, i.e. kind = submission, status =
//     in_progress, AND past the 30-minute live window (isSubmissionLocked). This
//     DELETES the stuck attempt (its row and any partial recording). Under the
//     Piece 4 model no new graded attempts are started, so this path is dormant,
//     but it is kept for any legacy in_progress row.
//
//   type = "retake"       (Piece 4): allow a retake of a FINISHED submission.
//     Requires kind = submission, status = scored. It is NO LONGER destructive:
//     it RETURNS the submission to the student's practice pool (kind submission
//     -> practice, submitted_at cleared), keeping the recording and the score so
//     the student can submit again. Nothing is deleted.
//
//     ==> PHASE 4a: IT ALSO CLEARS THE REVIEW AND PUTS THE AI'S OWN SCORE BACK.
//         A retake un-submits the attempt, so an instructor's review of it is a
//         review of something that is no longer a submission. Leaving the
//         overridden levels on the row would put a HUMAN's grade back into the
//         student's practice pool wearing the AI's clothes, and the student
//         would then re-submit a score a professor had already adjusted. So the
//         AI's levels, points and total are restored from
//         public.submission_ai_scores and reviewed_at goes back to null.
//
//         THE LOG ROWS SURVIVE, and so does the stored AI original. The review
//         really happened and the record of it is not the instructor's to
//         withdraw by pressing a different button; and keeping the original
//         means a later review of the same row still cannot overwrite it. <==
//
// Anything else is refused: it can never touch a practice row, and never an
// in_progress attempt that is still inside the live window (the student may
// still be in it).
//
// It runs SERVER-SIDE ONLY with the service-role key (never the browser), and
// every query is scoped to the single target session id, so it can never affect
// another student, another assignment, another submission, or any practice row.
//
// Order of operations: check EVERY reason to stop first, including Phase 4a's
// read of the AI's original score, because stopping is free until something has
// been written; then write the audit record (so the snapshot is captured with
// the facts still true); then apply the effect for the requested path
// (interrupted: remove the recording then delete the row; retake: turn the row
// back into a practice, restore the AI's score, clear the review marker, and
// re-run the retention cap keeping the returned one).
import { NextResponse } from "next/server";
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { isSubmissionLocked } from "@/lib/submission";
import { prunePractices } from "@/lib/practice";
import { readAiOriginal } from "@/lib/submission-review";
import type { SessionScore } from "@/lib/types";

type ResetType = "interrupted" | "retake";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("reset submissions");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId, userId, email } = gate;

  // 3. Read the requested path from the body.
  let type: ResetType | undefined;
  try {
    const body = await request.json();
    type = body?.type;
  } catch {
    // fall through to the validation below
  }
  if (type !== "interrupted" && type !== "retake") {
    return NextResponse.json(
      { error: "Missing or invalid reset type." },
      { status: 400 },
    );
  }

  // 4. Load the ONE target session (scoped to this id only).
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    // GATE 3a: class_id joins this read so the audit record below can carry it.
    // GATE 3b: and so the check immediately below has something to compare.
    .select(
      // PHASE 4a: reviewed_at joins this read so the retake can tell "never
      // reviewed, so the score on the row is already the AI's" from "reviewed,
      // and the AI's score had better be on record".
      "id, kind, status, created_at, student_id, assignment_id, video_path, score, reviewed_at, class_id",
    )
    .eq("id", id)
    .single();
  if (sessionError || !session) {
    return NextResponse.json(
      { error: "That submission was not found. It may already be reset." },
      { status: 404 },
    );
  }

  // 4b. GATE 3b. The submission must be in the caller's own class. The
  //     "interrupted" path DELETES the row and its recording, so this guard sits
  //     above every effect below it, and above the audit write.
  const outside = refuseOutsideClass(session.class_id, classId, "submission");
  if (outside) {
    return NextResponse.json(
      { error: "That submission was not found. It may already be reset." },
      { status: outside.status },
    );
  }

  // 5. Re-verify the session qualifies for the requested path. Refuse anything
  //    else. This is the real guard: it never trusts the browser about the
  //    session's state, and it can never delete a practice row or an in_progress
  //    attempt that is still inside the live window.
  if (type === "interrupted") {
    // isSubmissionLocked already checks kind = submission AND status =
    // in_progress AND past the window, so a true result guarantees all three.
    if (!isSubmissionLocked(session)) {
      return NextResponse.json(
        {
          error:
            "This attempt cannot be reset: it is not a locked, interrupted submission.",
        },
        { status: 409 },
      );
    }
  } else {
    // type === "retake": only a finished, scored submission qualifies.
    if (session.kind !== "submission" || session.status !== "scored") {
      return NextResponse.json(
        {
          error:
            "A retake can only be allowed for a completed, scored submission.",
        },
        { status: 409 },
      );
    }
  }

  // 6. Gather the snapshot facts (student email and assignment title) while the
  //    submission still exists.
  const [{ data: student }, { data: assignment }] = await Promise.all([
    admin.from("profiles").select("email").eq("id", session.student_id).single(),
    admin
      .from("assignments")
      // GATE 3a: class_id joins this read purely as the fallback described below.
      .select("title, class_id")
      .eq("id", session.assignment_id)
      .single(),
  ]);

  const score = (session.score ?? null) as SessionScore | null;

  // ==> 6b. PHASE 4a. READ THE AI'S ORIGINAL BEFORE THE AUDIT ROW IS WRITTEN,
  //     AND REFUSE HERE RATHER THAN LATER. The order is the whole point of this
  //     block sitting above step 7 instead of down in step 8 where it is used.
  //
  //     THE AUDIT ROW IS A RECORD THAT A RETAKE HAPPENED. Reading the original
  //     after writing it would mean a failed read leaves a permanent audit entry
  //     describing a retake that did not take place, in a log that exists
  //     precisely so that what it says can be relied on. So every reason to stop
  //     is checked while stopping is still free.
  //
  //     ==> AND THE SECOND CASE IS THE ONE THAT MATTERS. A submission that HAS
  //         been reviewed and has no stored AI original is a state no route can
  //         produce, because the review function refuses to move a grade without
  //         one. If it somehow arises, the only two things this route could do
  //         are refuse, or return the practice to the student's pool still
  //         carrying THE INSTRUCTOR'S adjusted grade while telling everyone it
  //         is the AI's. It refuses. A submission nobody ever reviewed is the
  //         ordinary case and needs no original: the score on the row is already
  //         the AI's own. <==
  let aiRestore: { score: SessionScore; scoreTotal: number | null } | null = null;
  if (type === "retake") {
    const original = await readAiOriginal(admin, session.id);
    if (!original.ok) {
      return NextResponse.json(
        {
          error:
            "The AI's original score could not be read, so nothing was changed. Please try again.",
        },
        { status: 500 },
      );
    }
    if (session.reviewed_at && !original.original) {
      console.error(
        "Refused a retake: the submission is marked reviewed but no AI original is stored:",
        session.id,
      );
      return NextResponse.json(
        {
          error:
            "This submission has been reviewed but the AI's original score is not on record, so it cannot be returned to the practice pool. Nothing was changed.",
        },
        { status: 409 },
      );
    }
    aiRestore = original.original;
  }

  // 7. Write the audit record FIRST. If this fails we delete nothing, so a reset
  //    is never performed without a record of it.
  const { error: auditError } = await admin.from("submission_resets").insert({
    instructor_id: userId,
    instructor_email: email,
    student_id: session.student_id,
    student_email: student?.email ?? "unknown",
    assignment_id: session.assignment_id,
    assignment_title: assignment?.title ?? "Assignment",
    session_id: session.id,
    session_kind: session.kind,
    prior_status: session.status,
    reset_type: type,
    // Only a graded retake carries a prior score; an interrupted attempt has none.
    //
    // ==> PHASE 4a LOOKED AT THESE TWO LINES AND DELIBERATELY LEFT THEM ALONE.
    //     `score` was read before any of the writes below, so on a REVIEWED
    //     submission this records the INSTRUCTOR'S total, which is the score
    //     that was genuinely in force at the moment the retake was allowed.
    //     That is what an audit of a retake should say. The AI's own total is
    //     not lost by this: it is in public.submission_ai_scores, and the
    //     restore below is about to put it back on the row. <==
    prior_score_total: type === "retake" ? (score?.total ?? null) : null,
    prior_score_max: type === "retake" ? (score?.max_total ?? null) : null,
    // GATE 3a, write path 9 of 9. The audit row belongs to the same class as the
    // session it records. The assignment is a fallback and should never be
    // needed after the Gate 3a repair backfill: it is here because this record
    // is the only thing left once the submission is gone, so it must never be
    // written without an owner.
    class_id: session.class_id ?? assignment?.class_id ?? null,
  });
  if (auditError) {
    console.error("Writing the reset audit record failed:", auditError);
    return NextResponse.json(
      { error: "Could not record this reset. Nothing was deleted." },
      { status: 500 },
    );
  }

  // 8. Apply the effect. The two paths diverge here.
  if (type === "interrupted") {
    // Recover a stuck attempt: delete its recording (a database delete does not
    // remove Storage files, so we remove it by hand using the stored path),
    // then delete the row. Best-effort on Storage: a missing or already-removed
    // file is logged, never thrown, so a Storage hiccup can never block clearing
    // the row. A null video_path (text, camera off, or a failed upload) simply
    // has nothing to remove.
    if (session.video_path) {
      const { error: removeError } = await admin.storage
        .from(SESSION_VIDEOS_BUCKET)
        .remove([session.video_path]);
      if (removeError) {
        console.error(
          "Removing the interrupted recording failed:",
          session.video_path,
          removeError,
        );
      }
    }
    const { error: deleteError } = await admin
      .from("sessions")
      .delete()
      .eq("id", session.id);
    if (deleteError) {
      console.error("Deleting the interrupted row failed:", session.id, deleteError);
      return NextResponse.json(
        {
          error:
            "The reset was recorded but the submission could not be deleted. Please try again.",
        },
        { status: 500 },
      );
    }
  } else {
    // type === "retake" (Piece 4): RETURN the submission to the practice pool
    // instead of deleting it. Reverse the conversion (kind submission ->
    // practice) and clear submitted_at, keeping the status ('scored'),
    // scored_at, and the recording. Nothing is deleted, so the student has a
    // re-selectable scored practice again and can submit once more. Once the row
    // is a practice, the one-submission unique index no longer blocks them.
    //
    // PHASE 4a: and it goes back to the pool carrying THE AI'S score, read and
    // checked back in step 6b while refusing was still free.
    //
    // ==> ONE UPDATE, NOT TWO, AND THE THREE GRADE FIELDS MOVE TOGETHER WITH THE
    //     KIND. A separate "restore the score" write would leave a window where
    //     the row is a practice in the student's pool still carrying the
    //     instructor's adjusted grade, and the student home reads score_total
    //     while the dashboard reads score, so a half-applied restore is two
    //     screens disagreeing about one number.
    //
    //     NO STORED ORIGINAL MEANS NOTHING TO RESTORE, and that is the ordinary
    //     case rather than an error: a submission nobody ever reviewed still
    //     carries the AI's own score, so only reviewed_at needs clearing (which
    //     is a no-op when it is already null). Writing score back from `score`
    //     here instead would be a second source for a number that is already
    //     correct on the row. <==
    const restore = aiRestore
      ? {
          score: aiRestore.score,
          score_total: aiRestore.scoreTotal,
          reviewed_at: null,
        }
      : { reviewed_at: null };

    const { error: returnError } = await admin
      .from("sessions")
      .update({ kind: "practice", submitted_at: null, ...restore })
      .eq("id", session.id);
    if (returnError) {
      console.error(
        "Returning the submission to the practice pool failed:",
        session.id,
        returnError,
      );
      return NextResponse.json(
        {
          error:
            "The reset was recorded but the submission could not be returned. Please try again.",
        },
        { status: 500 },
      );
    }

    // Retention cap: the returned practice carries its ORIGINAL (old) date, so
    // it can push the pool over the cap. Prune now, but force-keep the returned
    // practice (keepId) so its recording survives and it stays re-selectable;
    // the oldest OTHER practice is dropped if we are over the cap (owner
    // decision). Best-effort, exactly like every other prune: the return above
    // is already saved, so any failure here is logged and never undone. A retake
    // only exists on a gradable assignment, so the finished status is 'scored'.
    if (session.assignment_id) {
      try {
        await prunePractices(
          admin,
          session.student_id,
          session.assignment_id,
          "scored",
          session.id,
        );
      } catch (err) {
        console.error("Pruning after return-to-pool failed:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
