// Shared rules for assignment-linked practice and the practice retention cap.
//
// Practice attempts are UNLIMITED, but only the newest few FINISHED (scored)
// practices per student per assignment are kept (stored and reviewable). This is
// a retention cap for database cleanliness and storage cost, not a limit on
// rehearsal. When a new practice is scored, the older ones beyond the kept count
// are removed: their row AND their recording in Storage.
//
// A database delete does NOT touch Storage, so the recording is removed by hand,
// the same way the instructor student-delete route does (see
// app/api/instructor/delete-student/route.ts). All of this runs server-side with
// the service-role key, because sessions are server-written (data-model
// decision A).
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";

// How many finished (scored) practices we keep per student per assignment. This
// is the "X of 3" the student sees: count, list, and cap are all this one number.
export const KEPT_PRACTICES = 3;

type AdminClient = ReturnType<typeof createAdminClient>;

// Remove a practice's recording from Storage, if it has one. A practice can have
// a null video_path: a text practice, a camera-off voice practice, or a voice
// practice whose upload failed under the Stage 5 graceful-failure behavior. In
// every such case there is simply nothing to remove, and we just return so the
// caller can delete the row. Best-effort: a missing or already-removed file is
// logged, never thrown, so it can never block deleting the row.
async function removePracticeVideo(
  admin: AdminClient,
  videoPath: string | null,
): Promise<void> {
  if (!videoPath) return; // no recording to remove
  const { error } = await admin.storage
    .from(SESSION_VIDEOS_BUCKET)
    .remove([videoPath]);
  if (error) {
    console.error("Removing practice video failed:", videoPath, error);
  }
}

// Permanently delete ONE practice: its recording (if any) first, then its row.
// The caller is responsible for confirming ownership and that it really is a
// practice. Returns an error string only if the row delete itself failed.
export async function deletePractice(
  admin: AdminClient,
  practice: { id: string; video_path: string | null },
): Promise<{ error?: string }> {
  await removePracticeVideo(admin, practice.video_path);
  const { error } = await admin.from("sessions").delete().eq("id", practice.id);
  if (error) {
    console.error("Deleting practice row failed:", practice.id, error);
    return { error: "Could not delete the practice." };
  }
  return {};
}

// What "finished" means for one assignment's practices. A graded case's practice
// is finished when it has been SCORED. A conversation-only case (a scenario with
// no rubric) is never scored, so its practice is finished when the conversation
// is over, which is status 'completed'.
//
// This is passed in per assignment rather than guessed, and it is deliberately
// ONE value rather than "scored or completed". Every practice under one
// assignment shares that assignment's scenario, so an assignment is entirely one
// kind or the other, and the caller always knows which. Matching only the right
// status also keeps a rubric practice that stopped at 'completed' because SCORING
// FAILED out of the prune: that session is not a finished practice, it is a
// broken one the student can still retry, and it must not evict a good score.
export type FinishedPracticeStatus = "scored" | "completed";

// Keep only the newest KEPT_PRACTICES finished practices for this student and
// assignment; delete the older ones, each with its recording. Every query is
// scoped to (this student, this assignment, kind = practice, the finished status
// for this assignment), so it can NEVER touch another student's, another
// assignment's, or any graded submission's data.
//
// Best-effort by design: callers run this as cleanup AFTER the student's result is
// already saved, so any failure here is logged and the student keeps their
// result. The next finished practice re-runs the prune and corrects the count.
export async function prunePractices(
  admin: AdminClient,
  studentId: string,
  assignmentId: string,
  finishedStatus: FinishedPracticeStatus,
): Promise<void> {
  const { data: practices, error } = await admin
    .from("sessions")
    .select("id, video_path")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .eq("kind", "practice")
    .eq("status", finishedStatus)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error("Listing practices to prune failed:", error);
    return;
  }
  if (!practices || practices.length <= KEPT_PRACTICES) return;

  // Everything past the newest KEPT_PRACTICES is too old to keep.
  const tooOld = practices.slice(KEPT_PRACTICES);

  // Remove each recording first (Storage is not part of any database cascade),
  // then delete the rows in one statement.
  for (const p of tooOld) {
    await removePracticeVideo(admin, p.video_path);
  }
  const ids = tooOld.map((p) => p.id);
  const { error: deleteError } = await admin
    .from("sessions")
    .delete()
    .in("id", ids);
  if (deleteError) {
    console.error("Deleting old practice rows failed:", ids, deleteError);
  }
}

// RETIRED IN PIECE 4: this has no caller. It was the auto-delete of a student's
// practices when they submitted a graded assignment. Piece 4 changed the model
// (a submission is now a completed practice the student converts), so submitting
// no longer wipes their other practices. Kept here only so the history reads
// clearly; nothing calls it.
//
// When a student submits a graded assignment, ALL of that student's practices
// for that assignment are permanently cleared: every row AND its recording. This
// keeps a finished assignment clean, so old practice runs do not linger after the
// one official attempt. It is the same rows-plus-Storage cleanup as the retention
// cap above (prunePractices), but it keeps NONE: it removes every practice for the
// assignment rather than keeping the newest few.
//
// Scope is locked to (this student, this assignment, kind = practice), so it can
// NEVER touch the submission itself (kind = submission), another assignment, or
// another student. A null video_path practice (text, camera off, or a Stage 5
// failed upload) simply has no file to remove, and its row still deletes cleanly.
//
// Best-effort, exactly like prunePractices: the caller runs this only AFTER the
// submission's score is safely saved, so any failure here is logged and never
// costs the student their graded result. Leftover practices can be re-cleared.
export async function deletePracticesForAssignment(
  admin: AdminClient,
  studentId: string,
  assignmentId: string,
): Promise<void> {
  const { data: practices, error } = await admin
    .from("sessions")
    .select("id, video_path")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .eq("kind", "practice");

  if (error) {
    console.error("Listing practices to clear on submission failed:", error);
    return;
  }
  if (!practices || practices.length === 0) return; // nothing to clear

  // Remove each recording first (Storage is not part of any database cascade),
  // then delete the rows in one statement.
  for (const p of practices) {
    await removePracticeVideo(admin, p.video_path);
  }
  const ids = practices.map((p) => p.id);
  const { error: deleteError } = await admin
    .from("sessions")
    .delete()
    .in("id", ids);
  if (deleteError) {
    console.error(
      "Clearing practice rows on submission failed:",
      ids,
      deleteError,
    );
  }
}
