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
//     in_progress, AND past the 60-minute live window (isSubmissionLocked).
//
//   type = "retake"       (high stakes): allow a retake of a FINISHED grade.
//     Requires kind = submission, status = scored. This permanently destroys a
//     real grade and recording.
//
// Anything else is refused: it can never delete a practice row, and never an
// in_progress attempt that is still inside the live window (the student may
// still be in it).
//
// This is destructive, so it runs SERVER-SIDE ONLY with the service-role key
// (never the browser), and every query is scoped to the single target session
// id, so it can never affect another student, another assignment, another
// submission, or any practice row.
//
// Order of operations: write the audit record FIRST (so the snapshot is captured
// while the row still exists), then delete the Storage recording if there is one
// (a database delete does not remove Storage files), then delete the session row.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { isSubmissionLocked } from "@/lib/submission";
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
    .select(
      "id, kind, status, created_at, student_id, assignment_id, video_path, score",
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
      .select("title")
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
  });
  if (auditError) {
    console.error("Writing the reset audit record failed:", auditError);
    return NextResponse.json(
      { error: "Could not record this reset. Nothing was deleted." },
      { status: 500 },
    );
  }

  // 8. Delete the Storage recording if there is one. A database delete does not
  //    remove Storage files, so we remove it by hand using the stored path.
  //    Best-effort: a missing or already-removed file is logged, never thrown,
  //    so a Storage hiccup can never block clearing the row (an orphaned file is
  //    harmless and unreachable). A null video_path (text, camera off, or a
  //    failed upload) simply has nothing to remove.
  if (session.video_path) {
    const { error: removeError } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .remove([session.video_path]);
    if (removeError) {
      console.error(
        "Removing the submission recording failed:",
        session.video_path,
        removeError,
      );
    }
  }

  // 9. Delete the submission row. Once it is gone, the one-submission unique
  //    index no longer blocks the student, so their home shows Start assignment
  //    again. Scoped to this id only.
  const { error: deleteError } = await admin
    .from("sessions")
    .delete()
    .eq("id", session.id);
  if (deleteError) {
    console.error("Deleting the submission row failed:", session.id, deleteError);
    return NextResponse.json(
      {
        error:
          "The reset was recorded but the submission could not be deleted. Please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
