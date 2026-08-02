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
import { recordingLengthText } from "@/lib/recording-length";
import type { SessionScore } from "@/lib/types";
import { cardClasses } from "@/components/ui/card";
import { ActionIcon, Icon, IconEye, IconInbox } from "@/components/ui/icon";
import { SubmissionDownloadMenu } from "@/components/submission-download-menu";

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
  // PD-5: this ONE submission's recorded length, in seconds. Null on anything
  // finished before PD-5 shipped, which shows as a dash.
  recorded_seconds: number | null;
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
      .select(
        "id, student_id, mode, status, score, video_path, created_at, recorded_seconds",
      )
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
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      <section>
        {/* PD-8e: the heading and the selector share one line, heading left and
            control right. Stacking them cost a whole row of vertical space above
            a table whose entire point is density. */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h2 className="text-page-title font-medium text-content-primary">
            Submissions
          </h2>
          {selectorList.length > 0 && selected && (
            <div className="shrink-0">
              {/* The dropdown is how an instructor moves between the sessions
                  they are running, so it is labelled rather than left bare.
                  NOTE: the list is every assignment. There is no active or
                  inactive state in the data yet, so "Active Assignments" is the
                  agreed label for the control, not a filter (a PD-1 decision). */}
              <label
                htmlFor="assignment-selector"
                className="block text-micro text-content-tertiary"
              >
                Active Assignments
              </label>
              <div className="mt-0.5">
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
          <p className={cardClasses({ className: "text-body text-content-secondary" })}>
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
              <div className={cardClasses({ tone: "muted", bordered: false, padding: "none", className: "px-3 py-2.5" })}>
                <p className="text-meta text-content-secondary">Submissions</p>
                <p className="mt-1 text-stat font-medium tabular-nums">
                  {submittedCount}{" "}
                  <span className="text-meta font-normal text-content-tertiary">
                    / {enrolledCount}
                  </span>
                </p>
                <p className="mt-0.5 text-micro text-content-tertiary">
                  of {enrolledCount} enrolled
                </p>
              </div>

              <div className={cardClasses({ tone: "muted", bordered: false, padding: "none", className: "px-3 py-2.5" })}>
                <p className="text-meta text-content-secondary">Average score</p>
                <p className="mt-1 text-stat font-medium tabular-nums">
                  {avgTotal != null && maxTotal != null ? (
                    <>
                      {avgTotal}{" "}
                      <span className="text-meta font-normal text-content-tertiary">
                        / {maxTotal}
                      </span>
                    </>
                  ) : (
                    <span className="text-content-tertiary">-</span>
                  )}
                </p>
                <p className="mt-0.5 text-micro text-content-tertiary">graded so far</p>
              </div>

              <div className={cardClasses({ tone: "muted", bordered: false, padding: "none", className: "px-3 py-2.5" })}>
                <p className="text-meta text-content-secondary">Awaiting review</p>
                <p className="mt-1 text-stat font-medium tabular-nums">
                  {awaitingReview}
                </p>
                <p className="mt-0.5 text-micro text-content-tertiary">need finalizing</p>
              </div>
            </div>

            {/* Submissions table (kind = submission only). */}
            {rows.length === 0 ? (
              /* A REAL empty state. This used to be a lone thin card reading
                 "No submissions for this assignment yet.", which alongside three
                 tiles of zeros made the page look unfinished rather than simply
                 empty. The tiles stay: they are still informative at zero. */
              <div
                className={cardClasses({
                  padding: "none",
                  className: "px-6 py-10 text-center",
                })}
              >
                <Icon
                  icon={IconInbox}
                  size="md"
                  className="text-content-tertiary"
                />
                <p className="mt-2 text-body font-medium text-content-primary">
                  No submissions yet
                </p>
                {/* States what is actually TRUE right now rather than a generic
                    line, then offers one next action. */}
                <p className="mx-auto mt-1 max-w-sm text-meta text-content-secondary">
                  {enrolledCount > 0
                    ? `All ${enrolledCount} enrolled student${enrolledCount === 1 ? "" : "s"} still have this assignment open. Practice sessions never appear here.`
                    : "No students have registered yet, so there is nobody to submit this assignment. Practice sessions never appear here."}
                </p>
                <Link
                  href="/instructor/assignments"
                  className="mt-3 inline-block text-meta text-content-info hover:underline"
                >
                  Manage Assignments
                </Link>
              </div>
            ) : (
              /* EIGHT columns, table-layout: fixed, with the approved widths.
                 The old Actions column held four stacked controls, which is what
                 made every row four lines tall and ragged; splitting it into a
                 one-icon Review and a one-icon Download is what gets the table to
                 ONE LINE OF CONTENT PER ROW. That row-height change is the single
                 largest source of the tidiness here, more than any colour or
                 spacing choice. */
              <div className="overflow-x-auto rounded-lg border border-line-tertiary">
                <table className="w-full table-fixed text-meta">
                  <colgroup>
                    <col className="w-[21%]" />
                    <col className="w-[16%]" />
                    <col className="w-[7%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[17%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-line-tertiary text-left text-micro text-content-secondary">
                      <th className="px-2.5 py-1.5 font-medium">Student</th>
                      <th className="px-2.5 py-1.5 font-medium">Assignment</th>
                      <th className="px-2.5 py-1.5 font-medium">Mode</th>
                      {/* "Length", not the full "Recording Length". A deliberate,
                          owner-approved deviation from PD-5's label and ONLY here:
                          the full label is what forced this header onto two lines.
                          Both detail views keep the full label unchanged. */}
                      <th className="px-2.5 py-1.5 font-medium">Length</th>
                      <th className="px-2.5 py-1.5 font-medium">Score</th>
                      <th className="px-2.5 py-1.5 font-medium">Status</th>
                      <th className="px-2.5 py-1.5 font-medium">Review</th>
                      <th className="px-2.5 py-1.5 font-medium">Download</th>
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
                          className="border-b border-line-tertiary last:border-0"
                        >
                          <td className="px-2.5 py-2">
                            <div>{r.name}</div>
                            {r.name !== r.email && (
                              /* The email truncates rather than wrapping: it is
                                 the secondary identifier (the name is above it),
                                 and letting it wrap was adding a whole line to
                                 the row. The full address stays available as a
                                 tooltip. The NAME is deliberately allowed to
                                 wrap, because truncating a person's name in a
                                 grading table is a real loss. */
                              <div
                                className="truncate text-meta text-content-tertiary"
                                title={r.email}
                              >
                                {r.email}
                              </div>
                            )}
                          </td>
                          {/* Every row shows the SAME assignment (it is the one
                              selected above), so truncating loses nothing and
                              saves a wrapped line on every single row. */}
                          <td
                            className="truncate px-2.5 py-2 text-content-secondary"
                            title={selected.title}
                          >
                            {selected.title}
                          </td>
                          <td className="px-2.5 py-2">{modeShort(r.mode)}</td>
                          {/* PD-5: how long this student's ONE submission ran.
                              Never a total across their attempts. */}
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {recordingLengthText(r.recorded_seconds)}
                          </td>
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {isScored
                              ? `${r.score!.total} / ${r.score!.max_total}`
                              : "-"}
                          </td>
                          {/* STATUS, and the control that changes it.
                              Coloured TEXT rather than a Badge in this column
                              only: in a table this dense a pill per row is noise,
                              and the column header already supplies the context
                              the pill was compensating for. The Badge primitive
                              stays in use everywhere else in the app.

                              The reset controls live HERE rather than in an
                              actions column, and that is a correctness point, not
                              a layout one: an interrupted attempt has no score and
                              nothing worth viewing, so routing its recovery
                              through Review would strand it. The action belongs
                              to the state it changes.

                              "To review" is a STATIC placeholder until professor
                              finalization (built after Stage 6). The in_progress
                              states, though, are REAL and recomputed on the
                              server: "In progress" (inside the live window) vs
                              "Interrupted" (past it, resettable). */}
                          <td className="px-2.5 py-2">
                            {isScored ? (
                              <span className="text-content-warning">To review</span>
                            ) : isInterrupted ? (
                              <span className="text-content-warning">Interrupted</span>
                            ) : isInProgress ? (
                              <span className="text-content-secondary">In progress</span>
                            ) : (
                              <span className="text-content-secondary">{r.status}</span>
                            )}

                            {/* Labelled text, never an icon: these are
                                consequential and rare, and icon-only is for
                                routine, universally understood actions. All the
                                existing confirm behaviour is unchanged. */}
                            {isScored && (
                              <div className="mt-1">
                                <SubmissionResetButton
                                  sessionId={r.id}
                                  studentEmail={r.email}
                                  assignmentTitle={selected.title}
                                  type="retake"
                                  priorScoreTotal={r.score!.total}
                                  priorScoreMax={r.score!.max_total}
                                />
                              </div>
                            )}
                            {isInterrupted && (
                              <div className="mt-1">
                                <SubmissionResetButton
                                  sessionId={r.id}
                                  studentEmail={r.email}
                                  assignmentTitle={selected.title}
                                  type="interrupted"
                                />
                              </div>
                            )}
                          </td>

                          {/* REVIEW: one icon to the existing detail page, which
                              already shows the recording, the transcript and the
                              rubric score. Accent colour at rest, with a real
                              accessible name and a tooltip. */}
                          <td className="px-2.5 py-2">
                            <Link
                              href={`/instructor/submission/${r.id}`}
                              className="inline-flex rounded-md p-1 text-content-info hover:bg-surface-tertiary"
                            >
                              <ActionIcon
                                icon={IconEye}
                                label={`Review ${r.name}'s submission`}
                              />
                            </Link>
                          </td>

                          {/* DOWNLOAD: one icon opening the three downloads. Only
                              a scored submission has files worth offering. */}
                          <td className="px-2.5 py-2">
                            {isScored ? (
                              <SubmissionDownloadMenu
                                sessionId={r.id}
                                hasVideo={r.video_path != null}
                                studentName={r.name}
                              />
                            ) : (
                              <span className="text-content-tertiary">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* THE FOOTNOTE is what makes icon-only defensible in this table.
                Instructors are repeat users of a dense screen, so one quiet line
                explaining the two icons buys back the labels the columns dropped.
                Adopted from the mockup's own pattern. */}
            {rows.length > 0 && (
              <p className="mt-2 px-0.5 text-micro text-content-tertiary">
                Review opens the submission with its recording, transcript and
                rubric score. Download offers the video, the transcript, and a CSV
                of scores. Allow retake, under a submission&apos;s status, returns
                it to the student and deletes the recorded grade. Practice
                sessions never appear here.
              </p>
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
