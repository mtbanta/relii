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
import { BulkInviteForm } from "@/components/bulk-invite-form";
import { DeleteStudentButton } from "@/components/delete-student-button";
import { UninviteButton } from "@/components/uninvite-button";
import { CreateAssignmentForm } from "@/components/create-assignment-form";
import { EditAssignmentForm } from "@/components/edit-assignment-form";
import { DeleteAssignmentButton } from "@/components/delete-assignment-button";
import { AssignmentSelector } from "@/components/assignment-selector";
import { SubmissionResetButton } from "@/components/submission-reset-button";
import { ResetHistory } from "@/components/reset-history";
import type { ResetHistoryRow } from "@/components/reset-history";
import { NameGate } from "@/components/name-gate";
import { isSubmissionLocked } from "@/lib/submission";
import { displayName, hasName } from "@/lib/name";
import type { SessionScore } from "@/lib/types";

// Compact mode label for the submissions table (matches the mockup: "V+V").
function modeShort(mode: string): string {
  return mode === "voice_video" ? "V+V" : "Text";
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
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single();

  // Students who land here get sent to their own page.
  if (profile?.role !== "instructor") {
    redirect("/student");
  }

  // The required name gate applies to instructors too: with no name set, the
  // whole dashboard is replaced by the gate until first and last name are
  // entered. It does not return on later visits.
  if (!hasName(profile)) {
    return <NameGate email={user.email ?? ""} />;
  }

  // The admin (service-role) client reads data ordinary browser rules do not
  // allow (other students' emails, and submission rows joined to those emails).
  // It runs only here on the server; the key never reaches the browser, so no
  // database security rule needs to change.
  const admin = createAdminClient();

  // Every REGISTERED user (both roles), for the roster. We read all profiles
  // once and derive the pieces the dashboard needs from it, so there is a single
  // source of truth. The students slice is still the "enrolled" count for the
  // Submissions tile and the id -> email map the submissions table uses.
  const { data: allProfiles } = await admin
    .from("profiles")
    .select("id, email, role, first_name, last_name")
    .order("email", { ascending: true });

  const profilesAll = allProfiles ?? [];
  const students = profilesAll.filter((p) => p.role === "student");
  const registeredInstructors = profilesAll.filter(
    (p) => p.role === "instructor",
  );

  const studentById = new Map(students.map((s) => [s.id, s]));
  const enrolledCount = students.length;

  // The full invite list. A person's status is derived by matching emails
  // (case-insensitive, the same way the signup trigger does): an invite whose
  // email has no matching profile row is a PENDING invite; one that does match a
  // profile is already registered (and appears in the registered lists above).
  // Read server-side with the admin client, so no security rule changes.
  const { data: invites } = await admin
    .from("allowed_emails")
    .select("email, role")
    .order("email", { ascending: true });

  const registeredEmails = new Set(
    profilesAll.map((p) => p.email.toLowerCase()),
  );
  const pendingInvites = (invites ?? []).filter(
    (i) => !registeredEmails.has(i.email.toLowerCase()),
  );

  // The scenarios this instructor can assign (the create-assignment dropdown).
  // Only ENABLED scenarios are offered. A disabled scenario is one that is not
  // ready to be used: chunk 2c writes AI-generated candidate personas turned off,
  // so half-finished drafts can never be assigned to a student by accident.
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, title, persona_name")
    .eq("enabled", true)
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

  // How much student work sits under each of those assignments, split into
  // submissions vs practices. This drives the delete control: 0 sessions means a
  // clean delete (light confirm), 1+ means the strong type-DELETE confirm that
  // names the counts. Read with the admin client, because instructors cannot
  // read practice rows through ordinary browser rules. The delete route
  // re-counts server-side before acting, so these numbers are only for display.
  const assignmentCounts = new Map<
    string,
    { submissions: number; practices: number }
  >();
  const ownAssignmentIds = (assignments ?? []).map((a) => a.id);
  if (ownAssignmentIds.length > 0) {
    const { data: countRows } = await admin
      .from("sessions")
      .select("assignment_id, kind")
      .in("assignment_id", ownAssignmentIds);
    for (const row of countRows ?? []) {
      if (!row.assignment_id) continue;
      const current = assignmentCounts.get(row.assignment_id) ?? {
        submissions: 0,
        practices: 0,
      };
      if (row.kind === "submission") current.submissions += 1;
      else if (row.kind === "practice") current.practices += 1;
      assignmentCounts.set(row.assignment_id, current);
    }
  }

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
    <main className="mx-auto max-w-4xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Instructor dashboard</h1>
          <p className="text-sm text-gray-700">
            {displayName({ ...profile, email: user.email ?? "" })}
          </p>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Build new buyer personas with the AI (chunk 2b: generate and review). */}
          <Link href="/instructor/scaffold" className="text-sm underline">
            Persona scaffolding
          </Link>
          <SignOutButton />
        </div>
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

      {/* ---- Existing instructor controls ---- */}
      <AddEmailForm />
      <BulkInviteForm />

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
                const counts = assignmentCounts.get(a.id) ?? {
                  submissions: 0,
                  practices: 0,
                };
                const inUse = counts.submissions + counts.practices > 0;
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <EditAssignmentForm
                      assignment={{
                        id: a.id,
                        title: a.title,
                        instructions: a.instructions,
                        due_at: a.due_at,
                        required_mode: a.required_mode,
                        scenarioTitle: a.scenarios?.title ?? null,
                        personaName: a.scenarios?.persona_name ?? null,
                      }}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                      <span className="text-xs text-gray-400">
                        {inUse
                          ? `In use: ${counts.submissions} submission${counts.submissions === 1 ? "" : "s"}, ${counts.practices} practice${counts.practices === 1 ? "" : "s"}`
                          : "Not in use (no student work)"}
                      </span>
                      <DeleteAssignmentButton
                        assignmentId={a.id}
                        title={a.title}
                        submissionsCount={counts.submissions}
                        practicesCount={counts.practices}
                      />
                    </div>
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
        <h2 className="mb-1 font-medium">Roster</h2>
        <p className="mb-4 text-sm text-gray-500">
          Everyone with access to Relii, grouped by status. Registered users have
          signed up; pending invites are on the invite list but have not
          registered yet. Deleting a student permanently removes their account,
          sessions, and recorded videos, and frees their email from the invite
          list.
        </p>

        {/* Registered students: the existing Delete action, unchanged. */}
        <h3 className="mb-2 text-sm font-medium text-gray-700">
          Registered students{" "}
          <span className="font-normal text-gray-400">({students.length})</span>
        </h3>
        {students.length > 0 ? (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id} className="rounded-lg border border-gray-200 p-3">
                <DeleteStudentButton
                  studentId={s.id}
                  email={s.email}
                  name={displayName(s)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            No students have registered yet.
          </p>
        )}

        {/* Registered instructors: display only. There is no delete for an
            instructor (the delete-student route refuses a non-student), and you
            cannot delete yourself. Your own account is marked "(you)". */}
        <h3 className="mb-2 mt-6 text-sm font-medium text-gray-700">
          Registered instructors{" "}
          <span className="font-normal text-gray-400">
            ({registeredInstructors.length})
          </span>
        </h3>
        {registeredInstructors.length > 0 ? (
          <ul className="space-y-2">
            {registeredInstructors.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-2 rounded-lg border border-gray-200 p-3 text-sm"
              >
                <span>{displayName(p)}</span>
                {p.id === user.id && (
                  <span className="text-xs text-gray-400">(you)</span>
                )}
                {hasName(p) && (
                  <span className="text-xs text-gray-400">· {p.email}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            No instructors have registered yet.
          </p>
        )}

        {/* Pending invites: on the invite list but not registered yet. Either
            role can be pending. Each has an Un-invite action that removes just
            that one invite-list row (verified pending, server-side). */}
        <h3 className="mb-2 mt-6 text-sm font-medium text-gray-700">
          Invited, pending{" "}
          <span className="font-normal text-gray-400">
            ({pendingInvites.length})
          </span>
        </h3>
        {pendingInvites.length > 0 ? (
          <ul className="space-y-2">
            {pendingInvites.map((i) => (
              <li key={i.email} className="rounded-lg border border-gray-200 p-3">
                <UninviteButton email={i.email} role={i.role} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No pending invites.</p>
        )}
      </section>
    </main>
  );
}
