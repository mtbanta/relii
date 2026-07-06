// The instructor dashboard. The top of the page is the submissions dashboard:
// pick an assignment and see its submissions in a table with three summary
// tiles. Below that, the existing instructor controls remain unchanged: invite
// students, create assignments, and manage the student roster. It confirms the
// visitor is a logged-in instructor; otherwise it redirects.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/sign-out-button";
import { AddEmailForm } from "@/components/add-email-form";
import { DeleteStudentButton } from "@/components/delete-student-button";
import { CreateAssignmentForm } from "@/components/create-assignment-form";
import { AssignmentSelector } from "@/components/assignment-selector";
import { SubmissionResetButton } from "@/components/submission-reset-button";
import { isSubmissionLocked } from "@/lib/submission";
import type { SessionScore } from "@/lib/types";

// Friendly mode label for the assignments management list.
function modeLabel(mode: string): string {
  return mode === "voice_video" ? "Voice + video" : "Text";
}

// Compact mode label for the submissions table (matches the mockup: "V+V").
function modeShort(mode: string): string {
  return mode === "voice_video" ? "V+V" : "Text";
}

// Show a stored timestamp as a plain date. We read it in UTC so a date picked as
// "Aug 14" always shows as "Aug 14" (it is stored as midnight UTC).
function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// One assignment as read for the management list (this instructor's own).
type AssignmentRow = {
  id: string;
  title: string;
  required_mode: string;
  due_at: string | null;
  instructions: string | null;
  scenarios: { title: string; persona_name: string } | null;
};

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

export default async function InstructorHome({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string }>;
}) {
  const { assignment: assignmentParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Students who land here get sent to their own page.
  if (profile?.role !== "instructor") {
    redirect("/student");
  }

  // The admin (service-role) client reads data ordinary browser rules do not
  // allow (other students' emails, and submission rows joined to those emails).
  // It runs only here on the server; the key never reaches the browser, so no
  // database security rule needs to change.
  const admin = createAdminClient();

  // The roster of REGISTERED students (role = student). This is also the
  // "enrolled" count for the Submissions tile and the id -> email map the
  // submissions table uses to show each student.
  const { data: students } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "student")
    .order("email", { ascending: true });

  const studentEmailById = new Map((students ?? []).map((s) => [s.id, s.email]));
  const enrolledCount = students?.length ?? 0;

  // The scenarios this instructor can assign (the create-assignment dropdown).
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, title, persona_name")
    .order("created_at", { ascending: true });

  // ALL assignments, newest first, for the dashboard selector. Per decision B an
  // instructor may see any student's submission, so the selector is not limited
  // to the assignments this instructor created. Any logged-in user may read
  // assignments, so the ordinary client is fine.
  const { data: allAssignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, scenarios ( title, persona_name )")
    .order("created_at", { ascending: false })
    .returns<SelectorAssignment[]>();

  // The assignments THIS instructor created (the management list + create form
  // lower on the page). Unchanged from before.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, due_at, instructions, scenarios ( title, persona_name )")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

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

  // Build the table rows, one per student, sorted by email.
  const rows = submissions
    .map((s) => ({
      ...s,
      email: studentEmailById.get(s.student_id) ?? "Unknown student",
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

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
    <main className="mx-auto max-w-4xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Instructor dashboard</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      {/* ---- Submissions dashboard ---- */}
      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Submissions</h2>
          {selectorList.length > 0 && selected && (
            <AssignmentSelector
              assignments={selectorList.map((a) => ({
                id: a.id,
                label: a.title,
              }))}
              selectedId={selected.id}
            />
          )}
        </div>

        {selectorList.length === 0 || !selected ? (
          <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
            No assignments yet. Create an assignment below and your students&apos;
            submissions will appear here.
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
                      // is either "In progress" (still inside the 60-minute live
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
                          <td className="p-3">{r.email}</td>
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
          </>
        )}
      </section>

      {/* ---- Existing instructor controls (unchanged) ---- */}
      <AddEmailForm />

      <section className="mt-8">
        <h2 className="mb-1 font-medium">Assignments</h2>
        <p className="mb-3 text-sm text-gray-500">
          Create an assignment for a scenario and pick the mode the graded
          submission must use. Each student can submit an assignment once.
        </p>

        <CreateAssignmentForm scenarios={scenarios ?? []} createdBy={user.id} />

        <div className="mt-4">
          {assignments && assignments.length > 0 ? (
            <ul className="space-y-2">
              {assignments.map((a) => {
                const due = formatDueDate(a.due_at);
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {a.scenarios?.title ?? "Scenario"}
                      {a.scenarios?.persona_name
                        ? ` (with ${a.scenarios.persona_name})`
                        : ""}{" "}
                      &middot; {modeLabel(a.required_mode)}
                      {due ? ` · due ${due}` : ""}
                    </p>
                    {a.instructions && (
                      <p className="mt-1.5 text-sm text-gray-600">
                        {a.instructions}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              You have not created any assignments yet.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 font-medium">Students</h2>
        <p className="mb-3 text-sm text-gray-500">
          Deleting a student permanently removes their account, sessions, and
          recorded videos, and frees their email from the invite list.
        </p>

        {students && students.length > 0 ? (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id} className="rounded-lg border border-gray-200 p-3">
                <DeleteStudentButton studentId={s.id} email={s.email} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            No students have signed up yet.
          </p>
        )}
      </section>
    </main>
  );
}
