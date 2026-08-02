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
import {
  RECORDING_LENGTH_LABEL,
  recordingLengthText,
} from "@/lib/recording-length";
import type { SessionScore } from "@/lib/types";
import { cardClasses } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Icon,
  IconEye,
  IconVideo,
  IconFileText,
  IconTable,
  IconInbox,
} from "@/components/ui/icon";

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
        <div className="mb-4">
          <h2 className="text-page-title font-medium text-content-primary">
            Submissions
          </h2>
          {selectorList.length > 0 && selected && (
            <div className="mt-3">
              {/* The dropdown is how an instructor moves between the sessions
                  they are running, so it is labelled rather than left bare.
                  NOTE: the list is every assignment. There is no active or
                  inactive state in the data yet, so "Active Assignments" is the
                  agreed label for the control, not a filter. */}
              <label
                htmlFor="assignment-selector"
                className="block text-body font-medium text-content-primary"
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
                  No submissions for this assignment yet.
                </p>
                <p className="mx-auto mt-1 max-w-sm text-meta text-content-secondary">
                  Submissions appear here as students hand in their graded
                  attempt. Practice sessions never appear on this dashboard.
                </p>
              </div>
            ) : (
              /* table-layout: fixed with explicit widths, which is what keeps the
                 columns from jumping about as content changes (the mockup does
                 the same). The widths are set for the real SEVEN columns, not the
                 six the mockup was drawn with: Recording Length gets enough room
                 to keep its shipped label on one line, and Actions gets the
                 width its group needs. */
              <div className="overflow-x-auto rounded-lg border border-line-tertiary">
                <table className="w-full table-fixed text-meta">
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[19%]" />
                    <col className="w-[7%]" />
                    <col className="w-[13%]" />
                    <col className="w-[10%]" />
                    <col className="w-[12%]" />
                    <col className="w-[19%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-line-tertiary text-left text-micro text-content-secondary">
                      <th className="px-2.5 py-1.5 font-medium">Student</th>
                      <th className="px-2.5 py-1.5 font-medium">Assignment</th>
                      <th className="px-2.5 py-1.5 font-medium">Mode</th>
                      {/* PD-5. Sits next to Mode because the two are read
                          together: "V+V, 12:34" is the shape of the attempt. */}
                      <th className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                        {RECORDING_LENGTH_LABEL}
                      </th>
                      <th className="px-2.5 py-1.5 font-medium">Score</th>
                      <th className="px-2.5 py-1.5 font-medium">Status</th>
                      <th className="px-2.5 py-1.5 font-medium">Actions</th>
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
                              <div className="text-meta text-content-tertiary">
                                {r.email}
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-content-secondary">{selected.title}</td>
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
                          <td className="px-2.5 py-2">
                            {/* "To review" is a STATIC placeholder until
                                professor finalization (built after Stage 6);
                                there is no real reviewed/awaiting column yet. The
                                in_progress states, though, are REAL and recomputed
                                on the server: "In progress" (inside the live
                                window) vs "Interrupted" (past it, resettable). */}
                            {isScored ? (
                              <Badge tone="warning">To review</Badge>
                            ) : isInterrupted ? (
                              <Badge tone="danger">Interrupted</Badge>
                            ) : isInProgress ? (
                              <Badge tone="info">In progress</Badge>
                            ) : (
                              <Badge>{r.status}</Badge>
                            )}
                          </td>
                          <td className="px-2.5 py-2">
                            {/* ONE ACTION GROUP, not four loose things and a
                                button. View leads and the three downloads sit
                                under it behind a hairline and a "Download"
                                label, so a reader sees "open this" and "take a
                                copy of this" as two ideas rather than four
                                competing links.
                                Every one of the four is accent-coloured at rest,
                                so colour marks them all as controls; View is the
                                lead by WEIGHT alone. */}
                            <div className="flex flex-col items-start gap-1.5">
                              <Link
                                href={`/instructor/submission/${r.id}`}
                                className="inline-flex w-fit items-center gap-1.5 font-medium text-content-info hover:underline"
                              >
                                <Icon icon={IconEye} />
                                View
                              </Link>
                              {/* Compact download links (scored submissions
                                  only). Each hits an instructor-gated route.

                                  ICON PLUS TEXT, deliberately, not icon-only:
                                  these are three DIFFERENT downloads, so three
                                  bare icons would be a guessing game. The icon
                                  is decoration beside its own label, so it is
                                  aria-hidden and the link still reads as
                                  "Video" to a screen reader.

                                  THE RESTING AFFORDANCE MATTERS MORE THAN THE
                                  ICON. These three used to carry only a hover
                                  colour, so at rest they inherited the cell's
                                  text colour and were indistinguishable from the
                                  row's data. A hover-only treatment cannot
                                  advertise a control: the reader has to already
                                  know it is there in order to hover it, and on a
                                  touch screen there is no hover at all. So the
                                  accent colour is now on at REST and the
                                  underline is what hover adds.

                                  That leaves colour unable to mark out the lead
                                  action, so View is primary by WEIGHT instead. */}
                              {isScored && (
                                <div className="w-full border-t border-line-tertiary pt-1.5">
                                  <p className="text-micro text-content-tertiary">
                                    Download
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-1 text-micro">
                                    {r.video_path && (
                                      <a
                                        href={`/api/instructor/submission/${r.id}/video`}
                                        className="inline-flex items-center gap-1 text-content-info hover:underline"
                                      >
                                        <Icon icon={IconVideo} />
                                        Video
                                      </a>
                                    )}
                                    <a
                                      href={`/api/instructor/submission/${r.id}/transcript`}
                                      className="inline-flex items-center gap-1 text-content-info hover:underline"
                                    >
                                      <Icon icon={IconFileText} />
                                      Transcript
                                    </a>
                                    <a
                                      href={`/api/instructor/submission/${r.id}/csv`}
                                      className="inline-flex items-center gap-1 text-content-info hover:underline"
                                    >
                                      <Icon icon={IconTable} />
                                      CSV
                                    </a>
                                  </div>
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
