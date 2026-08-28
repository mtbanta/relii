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
// Anything else is refused: it can never touch a practice row, and never an
// in_progress attempt that is still inside the live window (the student may
// still be in it).
//
// It runs SERVER-SIDE ONLY with the service-role key (never the browser), and
// every query is scoped to the single target session id, so it can never affect
// another student, another assignment, another submission, or any practice row.
//
// Order of operations: write the audit record FIRST (so the snapshot is captured
// with the facts still true), then apply the effect for the requested path
// (interrupted: remove the recording then delete the row; retake: turn the row
// back into a practice and re-run the retention cap keeping the returned one).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { isSubmissionLocked } from "@/lib/submission";
import { prunePractices } from "@/lib/practice";
import type { SessionScore } from "@/lib/types";

type ResetType = "interrupted" | "retake";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. The caller must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. The caller must be an instructor, verified on the server against the
  //    database. We also read their email here for the audit snapshot.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can reset submissions." },
      { status: 403 },
    );
  }

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
    .select(
      "id, kind, status, created_at, student_id, assignment_id, video_path, score, class_id",
    )
    .eq("id", id)
    .single();
  if (sessionError || !session) {
    return NextResponse.json(
      { error: "That submission was not found. It may already be reset." },
      { status: 404 },
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

  // 7. Write the audit record FIRST. If this fails we delete nothing, so a reset
  //    is never performed without a record of it.
  const { error: auditError } = await admin.from("submission_resets").insert({
    instructor_id: user.id,
    instructor_email: caller.email,
    student_id: session.student_id,
    student_email: student?.email ?? "unknown",
    assignment_id: session.assignment_id,
    assignment_title: assignment?.title ?? "Assignment",
    session_id: session.id,
    session_kind: session.kind,
    prior_status: session.status,
    reset_type: type,
    // Only a graded retake carries a prior score; an interrupted attempt has none.
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
    // practice) and clear submitted_at, keeping the score, status ('scored'),
    // scored_at, and the recording. Nothing is deleted, so the student has a
    // re-selectable scored practice again and can submit once more. Once the row
    // is a practice, the one-submission unique index no longer blocks them.
    const { error: returnError } = await admin
      .from("sessions")
      .update({ kind: "practice", submitted_at: null })
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
