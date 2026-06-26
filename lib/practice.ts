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

// Keep only the newest KEPT_PRACTICES finished practices for this student and
// assignment; delete the older ones, each with its recording. Every query is
// scoped to (this student, this assignment, kind = practice, status = scored),
// so it can NEVER touch another student's, another assignment's, or any graded
// submission's data.
//
// Best-effort by design: callers run this as cleanup AFTER the student's score is
// already saved, so any failure here is logged and the student keeps their
// result. The next scored practice re-runs the prune and corrects the count.
export async function prunePractices(
  admin: AdminClient,
  studentId: string,
  assignmentId: string,
): Promise<void> {
  const { data: practices, error } = await admin
    .from("sessions")
    .select("id, video_path")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .eq("kind", "practice")
    .eq("status", "scored")
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
