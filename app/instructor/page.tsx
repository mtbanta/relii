// SUBMISSIONS: the instructor's default landing page, reached at /instructor.
//
// Pick an assignment from the Active Assignments dropdown and see its
// submissions in a table with three summary tiles, plus the reset / allow-retake
// controls and that assignment's reset history.
//
// The header, the navigation menu, the signed-in-instructor check, and the name
// gate all live in the shared layout (app/instructor/layout.tsx). Invite Users,
// Manage Assignments, and Roster used to sit below this view on one long page;
// they are now their own pages under the same nav, each reading only its own
// data.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignmentSelector } from "@/components/assignment-selector";
import { SubmissionResetButton } from "@/components/submission-reset-button";
import { ResetHistory } from "@/components/reset-history";
import type { ResetHistoryRow } from "@/components/reset-history";
import { requireInstructor } from "@/lib/instructor-auth";
import { isSubmissionLocked } from "@/lib/submission";
import { displayName } from "@/lib/name";
import type { SessionScore } from "@/lib/types";

// Compact mode label for the submissions table (matches the mockup: "V+V").
function modeShort(mode: string): string {
  return mode === "voice_video" ? "V+V" : "Text";
}

// One assignment as read for the dashboard selector (ALL assignments).
type SelectorAssignment = {
  id: string;
  title: string;
  required_mode: string;
  scenarios: { title: string; persona_name: string } | null;
};

// One submission row for the selected assignment. created_at is needed to
// recompute the lock state server-side (see isSubmissionLocked).
type SubmissionRow = {
  id: string;
  student_id: string;
  mode: string;
  status: string;
  score: SessionScore | null;
  video_path: string | null;
  created_at: string;
};

export default async function InstructorSubmissions({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string }>;
}) {
  const { assignment: assignmentParam } = await searchParams;

  // The layout already gated this page; this confirms it again for the page
  // itself, which is also how it gets the signed-in user.
  await requireInstructor();

  const supabase = await createClient();

  // The admin (service-role) client reads data ordinary browser rules do not
  // allow (other students' emails, and submission rows joined to those emails).
  // It runs only here on the server; the key never reaches the browser, so no
  // database security rule needs to change.
  const admin = createAdminClient();

  // The registered STUDENTS. This view needs them for two things only: the
  // "enrolled" count on the Submissions tile, and the id -> name/email map the
  // table shows. The full roster of every user (both roles, plus the pending
  // invites) belongs to the Roster page and is read there.
  const { data: studentProfiles } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("role", "student")
    .order("email", { ascending: true });

  const students = studentProfiles ?? [];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const enrolledCount = students.length;

  // ALL assignments, newest first, for the dashboard selector. Per decision B an
  // instructor may see any student's submission, so the selector is not limited
  // to the assignments this instructor created. Any logged-in user may read
  // assignments, so the ordinary client is fine.
  const { data: allAssignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, scenarios ( title, persona_name )")
    .order("created_at", { ascending: false })
    .returns<SelectorAssignment[]>();

  // Resolve which assignment the dashboard is showing: the one named in the URL
  // if it is valid, otherwise the newest.
  const selectorList = allAssignments ?? [];
  const selected =
    selectorList.find((a) => a.id === assignmentParam) ?? selectorList[0] ?? null;

  // Read the selected assignment's SUBMISSIONS only (kind = submission), so
  // practice sessions never appear anywhere in this dashboard. Read with the
  // admin client, server-side.
  let submissions: SubmissionRow[] = [];
  if (selected) {
    const { data } = await admin
      .from("sessions")
      .select("id, student_id, mode, status, score, video_path, created_at")
      .eq("assignment_id", selected.id)
      .eq("kind", "submission")
      .returns<SubmissionRow[]>();
    submissions = data ?? [];
  }

  // The reset history for the selected assignment, newest first. Read
  // instructor-only with the admin client, server-side (the same pattern the
  // rest of the dashboard uses). Scoped to this assignment.
  let resets: ResetHistoryRow[] = [];
  if (selected) {
    const { data } = await admin
      .from("submission_resets")
      .select(
        "id, student_email, reset_type, prior_score_total, prior_score_max, created_at, instructor_email",
      )
      .eq("assignment_id", selected.id)
      .order("created_at", { ascending: false })
      .returns<ResetHistoryRow[]>();
    resets = data ?? [];
  }

  // Build the table rows, one per student, sorted by the name shown. Each row
  // carries both the display name (name, or email when no name is set) and the
  // email, so the Student column can show the name with the email beneath it.
  const rows = submissions
    .map((s) => {
      const student = studentById.get(s.student_id);
      return {
        ...s,
        email: student?.email ?? "Unknown student",
        name: student ? displayName(student) : "Unknown student",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Tile numbers.
  // Submissions: how many enrolled students have a submission row for this
  // assignment. One submission per student per assignment is enforced, so the
  // number of rows is the number of students.
  const submittedCount = new Set(submissions.map((s) => s.student_id)).size;

  // Average score: over the SCORED submissions only (a null score cannot be
  // averaged). Shown against the real stored max (180 today, not 290).
  const scored = submissions.filter((s) => s.score != null);
  const avgTotal =
    scored.length > 0
      ? Math.round(
          scored.reduce((sum, s) => sum + (s.score?.total ?? 0), 0) /
            scored.length,
        )
      : null;
  const maxTotal = scored[0]?.score?.max_total ?? null;

  // Awaiting review: PLACEHOLDER. With no professor finalization yet, every
  // scored submission is "awaiting review" by definition. The finalization piece
  // (built after Stage 6) will make this a real reviewed/awaiting count.
  const awaitingReview = scored.length;

  return (
    <main className="mx-auto max-w-5xl px-8 pb-12 pt-6">
      <section>
        <div className="mb-4">
          <h2 className="font-medium">Submissions</h2>
          {selectorList.length > 0 && selected && (
            <div className="mt-3">
              {/* The dropdown is how an instructor moves between the sessions
                  they are running, so it is labelled rather than left bare.
                  NOTE: the list is every assignment. There is no active or
                  inactive state in the data yet, so "Active Assignments" is the
                  agreed label for the control, not a filter. */}
              <label
                htmlFor="assignment-selector"
                className="block text-sm font-medium text-gray-700"
              >
                Active Assignments
              </label>
              <div className="mt-1">
                <AssignmentSelector
                  assignments={selectorList.map((a) => ({
                    id: a.id,
                    label: a.title,
                  }))}
                  selectedId={selected.id}
                />
              </div>
            </div>
          )}
        </div>

        {selectorList.length === 0 || !selected ? (
          <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
            No assignments yet. Create one on the{" "}
            <Link href="/instructor/assignments" className="underline">
              Manage Assignments
            </Link>{" "}
            page and your students&apos; submissions will appear here.
          </p>
        ) : (
          <>
            {/* Three summary tiles. */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Submissions</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {submittedCount}{" "}
                  <span className="text-sm font-normal text-gray-400">
                    / {enrolledCount}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  of {enrolledCount} enrolled
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Average score</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {avgTotal != null && maxTotal != null ? (
                    <>
                      {avgTotal}{" "}
                      <span className="text-sm font-normal text-gray-400">
                        / {maxTotal}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">graded so far</p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Awaiting review</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {awaitingReview}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">need finalizing</p>
              </div>
            </div>

            {/* Submissions table (kind = submission only). */}
            {rows.length === 0 ? (
              <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                No submissions for this assignment yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="p-3 font-medium">Student</th>
                      <th className="p-3 font-medium">Assignment</th>
                      <th className="p-3 font-medium">Mode</th>
                      <th className="p-3 font-medium">Score</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isScored = r.score != null;
                      // Recompute the lock state on the SERVER (never trust the
                      // browser). A graded submission that is still in_progress
                      // is either "In progress" (still inside the 30-minute live
                      // window, the student may still be in it, no reset) or
                      // "Interrupted" (past the window, now resettable).
                      const locked = isSubmissionLocked({
                        kind: "submission",
                        status: r.status,
                        created_at: r.created_at,
                      });
                      const isInterrupted =
                        r.status === "in_progress" && locked;
                      const isInProgress =
                        r.status === "in_progress" && !locked;
                      return (
                        <tr
                          key={r.id}
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="p-3">
                            <div>{r.name}</div>
                            {r.name !== r.email && (
                              <div className="text-xs text-gray-400">
                                {r.email}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-gray-500">{selected.title}</td>
                          <td className="p-3">{modeShort(r.mode)}</td>
                          <td className="p-3 tabular-nums">
                            {isScored
                              ? `${r.score!.total} / ${r.score!.max_total}`
                              : "-"}
                          </td>
                          <td className="p-3">
                            {/* "To review" is a STATIC placeholder until
                                professor finalization (built after Stage 6);
                                there is no real reviewed/awaiting column yet. The
                                in_progress states, though, are REAL and recomputed
                                on the server: "In progress" (inside the live
                                window) vs "Interrupted" (past it, resettable). */}
                            {isScored ? (
                              <span className="text-amber-700">To review</span>
                            ) : isInterrupted ? (
                              <span className="text-gray-400">Interrupted</span>
                            ) : isInProgress ? (
                              <span className="text-blue-600">In progress</span>
                            ) : (
                              <span className="text-gray-400">{r.status}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <Link
                                href={`/instructor/submission/${r.id}`}
                                className="text-blue-700 hover:underline"
                              >
                                View
                              </Link>
                              {/* Compact download links (scored submissions
                                  only). Each hits an instructor-gated route. */}
                              {isScored && (
                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                  {r.video_path && (
                                    <a
                                      href={`/api/instructor/submission/${r.id}/video`}
                                      className="hover:underline"
                                    >
                                      Video
                                    </a>
                                  )}
                                  <a
                                    href={`/api/instructor/submission/${r.id}/transcript`}
                                    className="hover:underline"
                                  >
                                    Transcript
                                  </a>
                                  <a
                                    href={`/api/instructor/submission/${r.id}/csv`}
                                    className="hover:underline"
                                  >
                                    CSV
                                  </a>
                                </div>
                              )}
                              {/* Reset / allow-retake control. A scored
                                  submission gets the stronger "Allow retake"
                                  (deletes a real grade); a locked interrupted
                                  attempt gets the simple "Reset". An in_progress
                                  attempt still inside the window gets neither. */}
                              {isScored && (
                                <SubmissionResetButton
                                  sessionId={r.id}
                                  studentEmail={r.email}
                                  assignmentTitle={selected.title}
                                  type="retake"
                                  priorScoreTotal={r.score!.total}
                                  priorScoreMax={r.score!.max_total}
                                />
                              )}
                              {isInterrupted && (
                                <SubmissionResetButton
                                  sessionId={r.id}
                                  studentEmail={r.email}
                                  assignmentTitle={selected.title}
                                  type="interrupted"
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-assignment reset history: a small "Resets: N" line that
                expands to a short, newest-first list. Read instructor-only,
                server-side. */}
            <ResetHistory resets={resets} />
          </>
        )}
      </section>
    </main>
  );
}
