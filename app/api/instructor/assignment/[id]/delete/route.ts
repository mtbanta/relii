// POST /api/instructor/assignment/<id>/delete
// Body: { confirmInUse?: boolean }
//
// An instructor-only control that deletes ONE assignment. There are two cases,
// and the route decides which it is by counting the assignment's sessions
// SERVER-SIDE (never trusting the browser), so the path cannot be spoofed and
// the audit numbers are true:
//
//   UNUSED (0 sessions): a clean, low-stakes delete. Nothing exists under the
//     assignment, so only the empty assignment row is removed. No audit record
//     is written (nothing was destroyed).
//
//   IN-USE (1+ sessions): the high-stakes case. It permanently destroys the
//     students' submissions and practices for this assignment, including their
//     recordings. It requires an explicit destructive acknowledgment
//     (confirmInUse = true, sent by the strong type-DELETE confirmation). If the
//     route finds the assignment in-use but the request did not carry that
//     acknowledgment (for example a stale "clean delete" from before a student
//     submitted), it refuses, so student work is never destroyed by accident.
//
// The database blocks deleting an assignment while any session still points at
// it (sessions.assignment_id references assignments ON DELETE RESTRICT), so the
// in-use path must clear the sessions FIRST. Sessions are server-written (data
// -model decision A), so this all runs SERVER-SIDE with the service-role key.
//
// Order for the in-use case: write the audit snapshot FIRST (while the facts
// still exist), then remove each linked session's recording from Storage (a
// database delete does not remove Storage files), then delete the session rows,
// then delete the assignment row. Every query is scoped to this one
// assignment_id, so it can never touch another assignment's data, and it never
// deletes the students themselves, only their sessions FOR this assignment.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";

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
  //    database. We also read their email here for the audit snapshot. Any
  //    instructor may manage any assignment (the "instructors manage
  //    assignments" rule is FOR ALL), so this is not creator-restricted.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can delete assignments." },
      { status: 403 },
    );
  }

  // 3. Read the destructive acknowledgment from the body (only meaningful for
  //    the in-use case; a clean delete does not need it).
  let confirmInUse = false;
  try {
    const body = await request.json();
    confirmInUse = body?.confirmInUse === true;
  } catch {
    // No body / bad JSON: treated as no acknowledgment.
  }

  // 4. Load the ONE target assignment (scoped to this id only).
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id, title, required_mode, scenario_id")
    .eq("id", id)
    .single();
  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: "That assignment was not found. It may already be deleted." },
      { status: 404 },
    );
  }

  // 5. Read this assignment's sessions (submissions AND practices) so we can
  //    decide used vs unused SERVER-SIDE and, for the in-use case, remove each
  //    recording. Scoped to this assignment_id only.
  const { data: sessions, error: sessionsError } = await admin
    .from("sessions")
    .select("id, kind, video_path")
    .eq("assignment_id", id);
  if (sessionsError) {
    console.error("Reading the assignment's sessions failed:", sessionsError);
    return NextResponse.json(
      { error: "Could not read the assignment's data. Nothing was deleted." },
      { status: 500 },
    );
  }

  const linked = sessions ?? [];
  const submissionsCount = linked.filter((s) => s.kind === "submission").length;
  const practicesCount = linked.filter((s) => s.kind === "practice").length;

  // ---- UNUSED: clean delete of the empty assignment row ------------------
  if (linked.length === 0) {
    const { error: deleteError } = await admin
      .from("assignments")
      .delete()
      .eq("id", id);
    if (deleteError) {
      console.error("Deleting the unused assignment failed:", id, deleteError);
      return NextResponse.json(
        { error: "Could not delete the assignment. Please try again." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, deleted: "clean" });
  }

  // ---- IN-USE: destroys student work, so guard and audit -----------------

  // 5b. Backstop: the destructive path requires an explicit acknowledgment. If
  //     it is missing, the assignment has student work the caller may not have
  //     known about (for example a student submitted after the page loaded), so
  //     we refuse rather than destroy anything.
  if (!confirmInUse) {
    return NextResponse.json(
      {
        error:
          "This assignment has student work. Reload the page and use the strong confirmation to delete it.",
        inUse: true,
        submissions: submissionsCount,
        practices: practicesCount,
      },
      { status: 409 },
    );
  }

  // 6. Snapshot the scenario name for the audit record (readable after the
  //    assignment is gone). Best-effort: a missing scenario just leaves it null.
  const { data: scenario } = await admin
    .from("scenarios")
    .select("title")
    .eq("id", assignment.scenario_id)
    .single();

  // 7. Write the audit record FIRST. If this fails we delete nothing, so an
  //    in-use assignment is never destroyed without a record of it.
  const { error: auditError } = await admin.from("assignment_deletes").insert({
    instructor_id: user.id,
    instructor_email: caller.email,
    assignment_id: assignment.id,
    assignment_title: assignment.title,
    scenario_id: assignment.scenario_id,
    scenario_title: scenario?.title ?? null,
    required_mode: assignment.required_mode,
    submissions_deleted: submissionsCount,
    practices_deleted: practicesCount,
  });
  if (auditError) {
    console.error("Writing the assignment-delete audit record failed:", auditError);
    return NextResponse.json(
      { error: "Could not record this deletion. Nothing was deleted." },
      { status: 500 },
    );
  }

  // 8. Remove every linked session's recording from Storage. A database delete
  //    does not remove Storage files, so we remove them by hand using each
  //    stored path. A null video_path (a text session, a camera-off voice
  //    practice, or a Stage 5 failed upload) simply has nothing to remove.
  //    Best-effort: a Storage hiccup is logged, never thrown (an orphaned file
  //    is harmless and unreachable), so it can never block clearing the rows.
  const paths = linked
    .map((s) => s.video_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .remove(paths);
    if (removeError) {
      console.error(
        "Removing the assignment's recordings failed:",
        paths,
        removeError,
      );
    }
  }

  // 9. Delete the session rows (submissions AND practices) for this assignment.
  //    Scoped to this assignment_id, so no other assignment's sessions are
  //    touched, and the students themselves are untouched (only their sessions
  //    for this assignment go). This must happen before the assignment row,
  //    because of the ON DELETE RESTRICT foreign key.
  const { error: sessionsDeleteError } = await admin
    .from("sessions")
    .delete()
    .eq("assignment_id", id);
  if (sessionsDeleteError) {
    console.error(
      "Deleting the assignment's sessions failed:",
      id,
      sessionsDeleteError,
    );
    return NextResponse.json(
      {
        error:
          "The deletion was recorded but the student work could not be cleared. Please try again.",
      },
      { status: 500 },
    );
  }

  // 10. Delete the assignment row itself. With its sessions gone, the ON DELETE
  //     RESTRICT no longer blocks it. Scoped to this id.
  const { error: assignmentDeleteError } = await admin
    .from("assignments")
    .delete()
    .eq("id", id);
  if (assignmentDeleteError) {
    console.error(
      "Deleting the assignment row failed:",
      id,
      assignmentDeleteError,
    );
    return NextResponse.json(
      {
        error:
          "The student work was cleared but the assignment could not be deleted. Please try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: "in_use",
    submissions: submissionsCount,
    practices: practicesCount,
  });
}
