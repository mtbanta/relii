// POST /api/instructor/assignment/<id>/delete
// Body: { confirmInUse?: boolean }
//
// An instructor-only control that deletes ONE assignment. There are two cases,
// and the route decides which it is by counting the assignment's sessions
// SERVER-SIDE (never trusting the browser), so the path cannot be spoofed and
// the audit numbers are true:
//
//   EMPTY (0 sessions): a clean, low-stakes delete. Nothing exists under the
//     assignment, so only the empty assignment row is removed. No audit record
//     is written (nothing was destroyed).
//
//   IN-USE (any FINISHED work): the high-stakes case. It permanently destroys the
//     students' submissions and practices for this assignment, including their
//     recordings. It requires an explicit destructive acknowledgment
//     (confirmInUse = true, sent by the strong type-DELETE confirmation). If the
//     route finds finished work but the request did not carry that
//     acknowledgment (for example a stale "clean delete" from before a student
//     submitted), it refuses, so student work is never destroyed by accident.
//
//   ==> PHASE 3a ADDED A THIRD: UNFINISHED ONLY (sessions exist, none of them
//       finished). The plain confirm proceeds. This is not a convenience, it is
//       a repair path. A rubric can never be replaced on an existing assignment,
//       so deleting and recreating is THE ONLY fix for a wrong rubric, and an
//       unfinished session appears on no screen anybody can reach: one abandoned
//       practice used to hold its assignment hostage and leave only the confirm
//       that destroys real submissions.
//
//       IT IS STILL DESTRUCTIVE AND IT IS TREATED AS SUCH. It runs the SAME body
//       as the in-use case, not a lighter copy of it: the audit row is written,
//       and Storage objects are removed before the rows. A failed-scoring VOICE
//       practice sits at 'completed' WITH a recording, so a plain path that
//       skipped Storage would leak files on the exact case this was built for.
//       The ONLY thing the three cases differ in is whether the typed
//       acknowledgment is demanded. What "unfinished" means lives in
//       lib/assignment-sessions.ts and is shared with the two screens. <==
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
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";
import type { AdminClient } from "@/lib/class-scope";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { tallySessions, plainDeleteApplies } from "@/lib/assignment-sessions";

// ==> PHASE 2a. DELETE THE ASSIGNMENT'S RUBRIC TOO, BUT ONLY IF NOTHING ELSE
//     POINTS AT IT. CALLED AFTER THE ASSIGNMENT ROW IS ALREADY GONE.
//
//     WHY THE CHECK IS NOT OPTIONAL, WITH THE REAL CASE RATHER THAN A
//     HYPOTHETICAL ONE. Today there is exactly ONE rubric in the database,
//     Great Northwoods. Two scenarios reference it, and after the Phase 2a
//     backfill the Alex and Jordan assignments do too. Both
//     scenarios_rubric_same_class_fkey and assignments_rubric_same_class_fkey
//     are ON DELETE RESTRICT.
//
//     So an unconditional delete here would destroy the assignment, write its
//     audit row, and only THEN hit a raw Postgres foreign-key error the user
//     cannot act on, with the destructive half already committed. Checking
//     first is what makes the failure impossible instead of merely reported.
//
//     Great Northwoods therefore survives, which is correct: it carries the
//     labels for every historical score. A rubric UPLOADED through the create
//     form is one-to-one with its assignment, so nothing else references it and
//     it is always cleaned up.
//
//     IT NEVER FAILS THE REQUEST. By the time this runs the assignment is
//     deleted and that is the operation the caller asked for. A rubric left
//     behind is untidy; reporting the whole delete as failed after it succeeded
//     would be wrong. Anything unexpected is logged and swallowed. <==
async function deleteRubricIfUnused(
  admin: AdminClient,
  rubricId: string | null | undefined,
): Promise<void> {
  if (!rubricId) return;

  try {
    const [{ count: scenarioRefs }, { count: assignmentRefs }] =
      await Promise.all([
        admin
          .from("scenarios")
          .select("id", { count: "exact", head: true })
          .eq("rubric_id", rubricId),
        admin
          .from("assignments")
          .select("id", { count: "exact", head: true })
          .eq("rubric_id", rubricId),
      ]);

    // FAILS CLOSED. A null count means the check did not answer, and the safe
    // response to "we do not know whether anything needs this" is to keep it.
    if (scenarioRefs === null || assignmentRefs === null) {
      console.warn(
        `Phase 2a: could not count references to rubric ${rubricId}. Leaving it in place.`,
      );
      return;
    }

    if (scenarioRefs > 0 || assignmentRefs > 0) {
      console.info(
        `Phase 2a: rubric ${rubricId} kept, still referenced by ${scenarioRefs} scenario(s) and ${assignmentRefs} assignment(s).`,
      );
      return;
    }

    const { error } = await admin.from("rubrics").delete().eq("id", rubricId);
    if (error) {
      console.error("Phase 2a: deleting the orphaned rubric failed:", rubricId, error);
    }
  } catch (err) {
    console.error("Phase 2a: the rubric cleanup threw:", rubricId, err);
  }
}

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
  const gate = await requireInstructorRequest("delete assignments");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId, userId, email } = gate;

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
    // GATE 3a: class_id joins this read so the audit record below can carry it.
    // GATE 3b: and so the check immediately below has something to compare.
    // PHASE 2a: rubric_id joins this read because the row is about to be
    // deleted, and step 11 needs to know which rubric it pointed at.
    .select("id, title, required_mode, scenario_id, class_id, rubric_id")
    .eq("id", id)
    .single();
  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: "That assignment was not found. It may already be deleted." },
      { status: 404 },
    );
  }

  // 4b. GATE 3b. The assignment must be in the caller's own class. This is the
  //     most destructive route in the app: the in-use path permanently destroys
  //     students' submissions and their recordings. Until now any instructor
  //     could aim it at any other instructor's assignment by id.
  //
  //     The old comment on the role check above said that any instructor may
  //     manage any assignment because the rule was FOR ALL. That was true when it
  //     was written and it is the exact hole this gate closes, so it is gone
  //     rather than reworded.
  const outside = refuseOutsideClass(assignment.class_id, classId, "assignment");
  if (outside) {
    return NextResponse.json(
      { error: "That assignment was not found. It may already be deleted." },
      { status: outside.status },
    );
  }

  // 5. Read this assignment's sessions (submissions AND practices) so we can
  //    decide used vs unused SERVER-SIDE and, for the in-use case, remove each
  //    recording. Scoped to this assignment_id only.
  const { data: sessions, error: sessionsError } = await admin
    .from("sessions")
    // PHASE 3a: status joins this read. Without it this route can count sessions
    // but cannot tell finished work from an abandoned or failed-scoring one, and
    // that distinction is now what decides whether the typed confirm is demanded.
    .select("id, kind, status, video_path")
    .eq("assignment_id", id);
  if (sessionsError) {
    console.error("Reading the assignment's sessions failed:", sessionsError);
    return NextResponse.json(
      { error: "Could not read the assignment's data. Nothing was deleted." },
      { status: 500 },
    );
  }

  const linked = sessions ?? [];

  // ==> PHASE 3a. THE ROUTE DECIDES, SERVER-SIDE, FROM ITS OWN COUNT, AND THAT
  //     SENTENCE IS THE WHOLE SAFETY ARGUMENT FOR LETTING THE PLAIN CONFIRM
  //     THROUGH AT ALL. The assignments page and the delete button run this same
  //     shared rule, but they run it against numbers read when the PAGE loaded.
  //     This runs it against the database as it is inside THIS request. If a
  //     student finishes a practice in between, the browser sends no
  //     acknowledgment, the tally here says finished work exists, and the 409
  //     below refuses. The screens choose what to show; only this chooses what
  //     to destroy.
  //
  //     hasRubric is what makes 'completed' mean two different things: a scoring
  //     failure on a graded assignment, and ordinary finished work on a
  //     conversation-only one. It comes from the assignment row already read
  //     above for its own deletion, so this costs no extra query. <==
  const hasRubric = assignment.rubric_id !== null;
  const tally = tallySessions(linked, hasRubric);
  const submissionsCount = tally.submissions;
  const practicesCount = tally.practices;
  const plainDelete = plainDeleteApplies(tally);

  // ---- EMPTY: clean delete of the empty assignment row -------------------
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
    await deleteRubricIfUnused(admin, assignment.rubric_id);
    return NextResponse.json({ ok: true, deleted: "clean" });
  }

  // ---- SESSIONS EXIST: rows are about to be destroyed either way ---------
  //
  // ==> ONE BODY FROM HERE DOWN, FOR BOTH REMAINING CASES, AND THAT IS
  //     DELIBERATE RATHER THAN TIDY. Everything below (the audit row, the
  //     Storage removal, the session rows, the assignment row, the orphaned
  //     rubric) runs identically whether or not the typed confirmation was
  //     demanded. Writing the unfinished case as its own shorter branch is the
  //     obvious shape and it is the wrong one: it would be a second copy of a
  //     destructive sequence, free to fall behind this one, and the first thing
  //     such a copy tends to omit is the Storage removal, which is exactly the
  //     leg that matters here (a failed-scoring voice practice HAS a recording).
  //     The audit row likewise: it exists because student data was destroyed,
  //     never because a strong confirm was shown. <==

  // 5b. Backstop: the destructive path requires an explicit acknowledgment, and
  //     since Phase 3a it requires it only when FINISHED work exists. If it is
  //     missing then, the assignment has student work the caller may not have
  //     known about (for example a student submitted, or a retry finally scored,
  //     after the page loaded), so we refuse rather than destroy anything.
  if (!plainDelete && !confirmInUse) {
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
    // GATE 3a: class_id joins this read purely as the fallback described below.
    .select("title, class_id")
    .eq("id", assignment.scenario_id)
    .single();

  // 7. Write the audit record FIRST. If this fails we delete nothing, so an
  //    in-use assignment is never destroyed without a record of it.
  const { error: auditError } = await admin.from("assignment_deletes").insert({
    instructor_id: userId,
    instructor_email: email,
    assignment_id: assignment.id,
    assignment_title: assignment.title,
    scenario_id: assignment.scenario_id,
    scenario_title: scenario?.title ?? null,
    required_mode: assignment.required_mode,
    submissions_deleted: submissionsCount,
    practices_deleted: practicesCount,
    // GATE 3a, write path 8 of 9. The audit row belongs to the same class as the
    // assignment it records. The scenario is a fallback and should never be
    // needed after the Gate 3a repair backfill: it is here because this record
    // is the only thing left once the assignment is gone, so it must never be
    // written without an owner.
    class_id: assignment.class_id ?? scenario?.class_id ?? null,
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

  await deleteRubricIfUnused(admin, assignment.rubric_id);

  // The browser only checks res.ok, so `deleted` is for the response log and for
  // whoever reads this route next. Phase 3a gives the two destructive paths
  // different names because "in_use" would be a lie about the new one: nothing
  // finished was in use.
  return NextResponse.json({
    ok: true,
    deleted: plainDelete ? "unfinished_only" : "in_use",
    submissions: submissionsCount,
    practices: practicesCount,
    unfinished: tally.unfinished,
  });
}
