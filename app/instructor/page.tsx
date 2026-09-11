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
import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignmentSelector } from "@/components/assignment-selector";
import {
  SubmissionResetProvider,
  SubmissionResetTrigger,
  SubmissionResetConfirmRow,
} from "@/components/submission-reset-button";
import { ResetHistory } from "@/components/reset-history";
import type { ResetHistoryRow } from "@/components/reset-history";
import { requireInstructor } from "@/lib/instructor-auth";
import { loadClassStudents, otherOwnedClass } from "@/lib/class-scope";
import { OtherClassNotice } from "@/components/other-class-notice";
import { isSubmissionLocked } from "@/lib/submission";
import { displayName } from "@/lib/name";
import { recordingLengthText } from "@/lib/recording-length";
import { formatPoints } from "@/lib/types";
import type { SessionScore } from "@/lib/types";
import { cardClasses } from "@/components/ui/card";
import { ActionIcon, Icon, IconEye, IconInbox } from "@/components/ui/icon";
import { SubmissionDownloads } from "@/components/submission-downloads";

// Compact mode label for the submissions table (matches the mockup: "V+V").
function modeShort(mode: string): string {
  return mode === "voice_video" ? "V+V" : "Text";
}

// How many columns the table has. Named because the reset confirm renders as its
// own row spanning ALL of them, so the two must never drift apart. Raised from 8
// to 9 when Allow retake and Reset moved into the Manage column.
const SUBMISSION_COLUMNS = 9;

// The instructions for this screen's controls, ONE SENTENCE PER LINE. They sit
// ABOVE the table rather than below it, because they explain controls the reader
// is about to use.
//
// THESE SENTENCES NAME WHERE EACH CONTROL LIVES, so they go stale the moment a
// control moves. That has now happened twice in this sprint (PD-8e shipped a
// footnote describing the retake backwards, and PD-8f moved the two controls out
// of the Status cell), so treat this constant as part of the table's layout:
// MOVE A CONTROL, EDIT THIS IN THE SAME CHANGE.
//
// The last line is a MEANING correction rather than a formatting one. It used to
// read "Practice sessions never appear here", which is misleading under the
// Piece 4 model where a submission IS a converted practice: what is true is that
// only the practice a student selected for submission shows up in this table.
const TABLE_INSTRUCTIONS = [
  "Review opens the submission with its recording, transcript and rubric score, and is where you confirm or change the AI's performance levels.",
  "Status reads To review until you save a review of that submission, and Reviewed afterwards.",
  "Download has three icons: the video, the transcript, and a CSV of scores. A greyed icon means that file does not exist for that submission.",
  "Allow retake, in the Manage column, returns a scored submission to the student's practice pool, keeping the score and recording so they can submit again.",
  "Reset, in the Manage column, permanently deletes an interrupted attempt and its recording.",
  "Only the Practice sessions selected for submission appear here.",
];

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
  // PHASE 4a: when an instructor last saved a review of this submission, or
  // null. It is a COLUMN and never a status, so nothing that keys on 'scored'
  // had to change: a reviewed submission is still finished, scored work.
  reviewed_at: string | null;
};

export default async function InstructorSubmissions({
  searchParams,
}: {
  searchParams: Promise<{ assignment?: string }>;
}) {
  const { assignment: assignmentParam } = await searchParams;

  // The layout already gated this page; this confirms it again for the page
  // itself, which is also how it gets the signed-in user.
  //
  // GATE 3b: the class id is now KEPT rather than discarded, because the student
  // list below is scoped to it.
  // GATE 6 also keeps the class LIST, for the ?assignment= answer below.
  const { classId, classes } = await requireInstructor();

  const supabase = await createClient();

  // The admin (service-role) client reads data ordinary browser rules do not
  // allow (other students' emails, and submission rows joined to those emails).
  // It runs only here on the server; the key never reaches the browser, so no
  // database security rule needs to change.
  const admin = createAdminClient();

  // The registered STUDENTS IN THIS INSTRUCTOR'S CLASS. This view needs them for
  // two things only: the "enrolled" count on the Submissions tile, and the
  // id -> name/email map the table shows. The full roster (both roles, plus the
  // pending invites) belongs to the Roster page and is read there.
  //
  // GATE 3b SCOPED THIS, and it CHANGES WHAT THE "ENROLLED" TILE MEANS: from
  // every student in the system to every student in this class. That is correct
  // and it is the point of the gate. It is invisible today with one instructor,
  // which is exactly why it needs testing deliberately rather than by looking at
  // the screen.
  //
  // Fails closed: an instructor with no class gets an empty list, not everybody.
  //
  // A submission from somebody outside this map renders as "Unknown student"
  // rather than resolving a name, which is the safe direction to fail in.
  const students = classId ? await loadClassStudents(admin, classId) : [];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const enrolledCount = students.length;

  // Assignments for the dashboard selector, newest first. Per decision B an
  // instructor may see any student's submission, so the selector is not limited
  // to the assignments this instructor CREATED.
  //
  // GATE 3a CHANGED WHAT THIS RETURNS, and the old comment here (which said any
  // logged-in user may read assignments, so the ordinary client is fine) is no
  // longer true. supabase/gate-3a-policies.sql rewrote the "read assignments"
  // rule from "anyone signed in" to "anyone who owns or belongs to the class".
  //
  // ==> GATE 6 ADDED THE EXPLICIT CLASS FILTER, BECAUSE THE POLICY STOPPED
  //     MEANING "THE WORKING CLASS". public.can_read_class() answers "any class
  //     you own", so with two classes this selector listed assignments from both
  //     while `students` and `enrolledCount` above come from the working class
  //     ONLY. Choosing an assignment from the other class rendered a table of
  //     real submissions with "Unknown student" against every row. Reading
  //     through the ordinary client is still right; the policy is the backstop
  //     and this line is what makes the page agree with the picker. <==
  const { data: allAssignments } = classId
    ? await supabase
        .from("assignments")
        // The SHORT embed form is correct here, and it is safe for a reason
        // rather than by luck: there is exactly ONE foreign key between
        // assignments and scenarios, the composite
        // assignments_scenario_same_class_fkey, which carries the plain
        // reference AND the same-class rule. Gate 4a briefly had two keys
        // between these tables, which made this join ambiguous; Supabase
        // returned an error instead of rows, this line reads only `data`, and
        // the page rendered EMPTY with nothing on screen and nothing in the
        // logs.
        // ==> IF A SECOND FOREIGN KEY IS EVER ADDED BETWEEN THESE TWO TABLES,
        //     THIS LINE BREAKS EXACTLY THAT WAY AGAIN. See PROJECT_STATE Open
        //     Issues. <==
        .select("id, title, required_mode, scenarios ( title, persona_name )")
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .returns<SelectorAssignment[]>()
    : { data: [] as SelectorAssignment[] };

  // Resolve which assignment the dashboard is showing: the one named in the URL
  // if it is valid, otherwise the newest.
  const selectorList = allAssignments ?? [];
  const selected =
    selectorList.find((a) => a.id === assignmentParam) ?? selectorList[0] ?? null;

  // ==> GATE 6, THE BOOKMARK CASE, AND IT IS THE SURFACE MOST LIKELY TO HAVE
  //     BEEN BOOKMARKED. Scoping the selector above means ?assignment=<id in my
  //     OTHER class> no longer matches, and the line above then falls back to
  //     this class's newest assignment. That fallback is right for a stranger's
  //     id and silently WRONG for the owner's own: you follow a saved link and
  //     get a different assignment's submissions with nothing saying so.
  //
  //     So on a miss, and ONLY on a miss, ask which class that assignment is in.
  //     One read on a failure path. It can leak nothing: the answer is compared
  //     against `classes`, which is the list of classes this account owns, so an
  //     assignment belonging to another instructor matches nothing, this stays
  //     null, and the page falls back exactly as it did before. <==
  let assignmentElsewhere: { id: string; name: string } | null = null;
  if (assignmentParam && !selectorList.some((a) => a.id === assignmentParam)) {
    const { data: strayAssignment } = await admin
      .from("assignments")
      .select("class_id")
      .eq("id", assignmentParam)
      .maybeSingle();
    assignmentElsewhere = otherOwnedClass(
      strayAssignment?.class_id,
      classes,
      classId,
    );
  }

  if (assignmentElsewhere) {
    return (
      <OtherClassNotice
        className={assignmentElsewhere.name}
        classId={assignmentElsewhere.id}
        thing="assignment"
      />
    );
  }

  // Read the selected assignment's SUBMISSIONS only (kind = submission), so
  // practice sessions never appear anywhere in this dashboard. Read with the
  // admin client, server-side.
  //
  // ==> GATE 3b DELIBERATELY DID NOT ADD ".eq(class_id, classId)" HERE, AND THAT
  //     IS NOT AN OVERSIGHT. Two separate reasons, and the second is the load
  //     bearing one.
  //
  //     FIRST, IT WOULD BE REDUNDANT. This read is filtered by selected.id, and
  //     `selected` is picked out of `selectorList`, which is read with the
  //     ORDINARY client and therefore already scoped by the Gate 3a "read
  //     assignments" rule. A foreign assignment id typed into the web address
  //     matches nothing in that list and falls back to this instructor's own
  //     newest assignment. The selector is already tamper-safe.
  //
  //     SECOND, AND THIS IS WHY IT WOULD BE ACTIVELY WRONG: sessions.class_id
  //     comes from the SCENARIO (Gate 1's rule, because assignment_id is
  //     nullable for free practice while scenario_id is not), while
  //     assignments.class_id comes from the CREATING INSTRUCTOR. Nothing in the
  //     schema prevents an assignment from pointing at a scenario in another
  //     class, so those two columns can legitimately disagree. A class filter
  //     here would then hide REAL submissions from the instructor who owns the
  //     assignment, silently. Not reachable today (the create-assignment
  //     dropdown reads scenarios through the rules, so it can only offer
  //     same-class scenarios), and parked for Gate 5 as a design ruling. <==
  let submissions: SubmissionRow[] = [];
  if (selected) {
    const { data } = await admin
      .from("sessions")
      .select(
        "id, student_id, mode, status, score, video_path, created_at, recorded_seconds, reviewed_at",
      )
      .eq("assignment_id", selected.id)
      .eq("kind", "submission")
      .returns<SubmissionRow[]>();
    submissions = data ?? [];
  }

  // The reset history for the selected assignment, newest first. Read
  // instructor-only with the admin client, server-side (the same pattern the
  // rest of the dashboard uses). Scoped to this assignment.
  //
  // GATE 3b ADDED NO CLASS FILTER HERE EITHER, for the reason above plus one of
  // its own: submission_resets.class_id is a PLAIN uuid with no foreign key (Gate
  // 1 made both audit logs snapshots on purpose, so that deleting an account or
  // an assignment can never blank a log entry). Filtering an audit log on a
  // column nothing enforces risks silently dropping a record of something that
  // really happened, which is worse than showing it.
  //
  // PD-8g: student_id came into this select so each entry can show the student's
  // NAME, resolved from the studentById map this page already built for the
  // table. No second query, and no change to what the audit table stores.
  //
  // THE SNAPSHOT EMAIL IS STILL WRITTEN AND STILL READ, as the fallback. The
  // audit row keeps the email on purpose, as a record of who it was at the time,
  // and that is the only thing left to show when the student has since been
  // deleted (no profile row to join to) or never set a name. A blank student in
  // an audit log would be worse than an email.
  let resets: ResetHistoryRow[] = [];
  if (selected) {
    const { data } = await admin
      .from("submission_resets")
      .select(
        "id, student_id, student_email, reset_type, prior_score_total, prior_score_max, created_at, instructor_email",
      )
      .eq("assignment_id", selected.id)
      .order("created_at", { ascending: false })
      .returns<(ResetHistoryRow & { student_id: string | null })[]>();
    resets = (data ?? []).map((row) => {
      const student = row.student_id ? studentById.get(row.student_id) : null;
      return {
        ...row,
        studentName: student ? displayName(student) : null,
      };
    });
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
  // averaged). Shown against the real stored max.
  const scored = submissions.filter((s) => s.score != null);

  // ==> PHASE 4a REMOVED A Math.round() FROM THIS LINE, AND IT WAS NOT A
  //     ROUNDING PREFERENCE, IT WAS A BUG AGAINST TOM'S OWN RUBRIC.
  //
  //     His Discovery ladder awards 49.5, 38.5, 13.5, 4.5 and 0.5 on four of its
  //     six criteria, so half totals are ordinary rather than exotic: a real
  //     submission scored 68.5 and another 57.5. A single scored submission
  //     therefore made this tile read 69 above a table row reading 68.5, which
  //     is one screen printing two different numbers for one student.
  //
  //     IT NOW SHOWS ONE DECIMAL. An average is a derived number, so displaying
  //     it to a fixed precision is honest; NO INDIVIDUAL SCORE IS ROUNDED
  //     ANYWHERE, which is the rule lib/types.ts formatPoints() exists to hold
  //     and which the Score column below now goes through too. <==
  const avgTotal =
    scored.length > 0
      ? scored.reduce((sum, s) => sum + (s.score?.total ?? 0), 0) / scored.length
      : null;
  const maxTotal = scored[0]?.score?.max_total ?? null;

  // ==> PHASE 4a. "AWAITING REVIEW" IS A REAL NUMBER NOW. It was a placeholder
  //     that counted every scored submission, on the reasoning that with no
  //     finalization anywhere they were all awaiting one by definition. That was
  //     true when it was written and stopped being true the moment an instructor
  //     could press Mark reviewed, at which point a tile that never moved would
  //     have been worse than no tile: it would have said there was work to do
  //     after the work was done. <==
  const reviewedCount = scored.filter((s) => s.reviewed_at != null).length;
  const awaitingReview = scored.length - reviewedCount;

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
                {/* One decimal, never a whole number, because half points are
                    real. See the note where avgTotal is computed. */}
                <p className="mt-1 text-stat font-medium tabular-nums">
                  {avgTotal != null && maxTotal != null ? (
                    <>
                      {avgTotal.toFixed(1)}{" "}
                      <span className="text-meta font-normal text-content-tertiary">
                        / {formatPoints(maxTotal)}
                      </span>
                    </>
                  ) : (
                    <span className="text-content-tertiary">-</span>
                  )}
                </p>
                {/* ==> PHASE 4a. HOW FAR THROUGH THE BATCH TOM IS, ON THE TILE
                    THAT SHOWS THE NUMBER HE IS DECIDING WHETHER TO TRUST. An
                    average over submissions a human has not looked at yet is an
                    average of the AI's opinion, and this line is what says so
                    without editorialising. */}
                <p className="mt-0.5 text-micro text-content-tertiary">
                  {scored.length > 0
                    ? `${reviewedCount} of ${scored.length} reviewed`
                    : "graded so far"}
                </p>
              </div>

              <div className={cardClasses({ tone: "muted", bordered: false, padding: "none", className: "px-3 py-2.5" })}>
                <p className="text-meta text-content-secondary">Awaiting review</p>
                <p className="mt-1 text-stat font-medium tabular-nums">
                  {awaitingReview}
                </p>
                <p className="mt-0.5 text-micro text-content-tertiary">
                  {awaitingReview === 0
                    ? "all reviewed"
                    : "scored, not yet reviewed"}
                </p>
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
                {/* The second sentence carries the same MEANING correction as
                    the instructions above the table: a submission IS a converted
                    practice under the Piece 4 model, so "practice sessions never
                    appear here" was misleading in both places. */}
                <p className="mx-auto mt-1 max-w-sm text-meta text-content-secondary">
                  {enrolledCount > 0
                    ? `All ${enrolledCount} enrolled student${enrolledCount === 1 ? "" : "s"} still have this assignment open. Only the Practice sessions selected for submission appear here.`
                    : "No students have registered yet, so there is nobody to submit this assignment. Only the Practice sessions selected for submission appear here."}
                </p>
                <Link
                  href="/instructor/assignments"
                  className="mt-3 inline-block text-meta text-content-info hover:underline"
                >
                  Manage Assignments
                </Link>
              </div>
            ) : (
              <>
              {/* THE INSTRUCTIONS, above the table rather than below it: they
                  explain the controls the reader is about to use, and one
                  sentence per line is far easier to scan than one running
                  paragraph. Capped at the reading measure, because at the wider
                  page a sentence would otherwise run the full 1120px. */}
              <div className="mb-2 max-w-reading space-y-0.5 px-0.5 text-meta text-content-secondary">
                {TABLE_INSTRUCTIONS.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>

              {/* NINE columns, table-layout: fixed, with the measured widths.
                 PD-8e's Actions column held four stacked controls, which made
                 every row four lines tall; splitting it into a one-icon Review
                 and a one-icon Download is what got the table to ONE LINE OF
                 CONTENT PER ROW.

                 PD-8f then added the ninth, Manage. At 896px a ninth column did
                 not fit, which is why the reset controls originally sat inside
                 the Status cell on their own line. At 1120px it does fit, and it
                 is measurably BETTER rather than merely tolerable: with the
                 control out of the Status cell that cell stops stacking, so a row
                 carrying a control drops from 61px to 53px. No header wraps, no
                 cell text wraps that did not already, and there is no horizontal
                 scroll. Owner-ruled on that measurement. */}
              <div className="overflow-x-auto rounded-lg border border-line-tertiary">
                <table className="w-full table-fixed text-meta">
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[15%]" />
                    <col className="w-[6%]" />
                    <col className="w-[7%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                    <col className="w-[9%]" />
                    <col className="w-[13%]" />
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
                      {/* MANAGE: the two state-changing controls, sitting next to
                          the Status they change rather than beside the two
                          routine icon actions. */}
                      <th className="px-2.5 py-1.5 font-medium">Manage</th>
                      <th className="px-2.5 py-1.5 font-medium">Review</th>
                      <th className="px-2.5 py-1.5 font-medium">Download</th>
                    </tr>
                  </thead>
                  {/* The provider holds which row's reset confirm is open. It
                      renders no element of its own, so it is legal directly
                      inside <tbody>, where only <tr> may live. */}
                  <tbody>
                    <SubmissionResetProvider>
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
                        <Fragment key={r.id}>
                        <tr className="border-b border-line-tertiary last:border-0">
                          <td className="px-2.5 py-2">
                            <div>{r.name}</div>
                            {r.name !== r.email && (
                              <div className="text-meta text-content-tertiary">
                                {r.email}
                              </div>
                            )}
                          </td>
                          {/* Left to WRAP rather than truncate. Truncating the
                              email and this title was tried and measured: row
                              heights were identical either way, because a wrapped
                              student name is what sets the height, so it chopped
                              legible text for no gain. (The Status cell used to
                              share that job, before its control moved to Manage.) */}
                          <td className="px-2.5 py-2 text-content-secondary">
                            {selected.title}
                          </td>
                          <td className="px-2.5 py-2">{modeShort(r.mode)}</td>
                          {/* PD-5: how long this student's ONE submission ran.
                              Never a total across their attempts. */}
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {recordingLengthText(r.recorded_seconds)}
                          </td>
                          {/* PHASE 4a routed this through formatPoints(). It was
                              the one place in the app where an individual score
                              became text without it. Nothing was wrong with the
                              output (template interpolation does not round), but
                              "points become text in exactly one place" is the
                              rule that keeps a Math.round() from ever landing
                              near a grade again, and an exception to it is how
                              the rule stops being one. */}
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {isScored
                              ? `${formatPoints(r.score!.total)} / ${formatPoints(r.score!.max_total)}`
                              : "-"}
                          </td>
                          {/* STATUS, now text only. The control that changes it
                              moved to Manage, the next column, on the owner's
                              ruling after PD-8f measured that a ninth column fits
                              at 1120px. It used to sit inside this cell on its own
                              line, which is what made this cell two lines tall and
                              set the height of every row carrying a control.

                              Coloured TEXT rather than a Badge in this column
                              only: in a table this dense a pill per row is noise,
                              and the column header already supplies the context
                              the pill was compensating for. The Badge primitive
                              stays in use everywhere else in the app.

                              ==> PHASE 4a MADE "To review" REAL. It used to be a
                              static placeholder printed under every scored
                              submission, because nothing could review one. Now a
                              scored submission is amber "To review" until an
                              instructor saves a review of it and green
                              "Reviewed" afterwards, read from sessions.reviewed_at.

                              THAT IS A COLUMN AND NOT A NEW STATUS, and the
                              distinction is load bearing rather than tidy:
                              sessions_status_check permits exactly three
                              statuses, seventeen sites in seven files key on
                              'scored', and lib/assignment-sessions.ts is only
                              total while those three are all there are. A
                              reviewed submission is still finished, scored work.
                              So r.status is untouched and this cell reads a
                              second fact beside it. <==

                              The in_progress states are REAL too and recomputed
                              on the server: "In progress" (inside the live
                              window) vs "Interrupted" (past it, resettable). */}
                          <td className="px-2.5 py-2">
                            {isScored ? (
                              r.reviewed_at ? (
                                <span className="text-content-success">Reviewed</span>
                              ) : (
                                <span className="text-content-warning">To review</span>
                              )
                            ) : isInterrupted ? (
                              <span className="text-content-warning">Interrupted</span>
                            ) : isInProgress ? (
                              <span className="text-content-secondary">In progress</span>
                            ) : (
                              <span className="text-content-secondary">{r.status}</span>
                            )}
                          </td>

                          {/* MANAGE: the one control that changes this row's
                              state, if it has one. It sits beside Status rather
                              than beside Review and Download, because that
                              adjacency is the point: an interrupted attempt has
                              no score and nothing worth viewing, so its recovery
                              belongs next to the state it changes, not among the
                              routine actions.

                              Labelled TEXT, never an icon: these are consequential
                              and rare, and icon-only is for routine, universally
                              understood actions. The two controls, their colours
                              and every confirm behaviour are unchanged; only the
                              trigger's cell moved, and the panel still opens as
                              the full-width row beneath (after this </tr>).

                              A row with neither control shows a dash rather than
                              an empty cell, the same way Score and Download do, so
                              every row keeps its shape. */}
                          <td className="px-2.5 py-2">
                            {isScored ? (
                              <SubmissionResetTrigger
                                sessionId={r.id}
                                type="retake"
                              />
                            ) : isInterrupted ? (
                              <SubmissionResetTrigger
                                sessionId={r.id}
                                type="interrupted"
                              />
                            ) : (
                              <span className="text-content-tertiary">-</span>
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

                          {/* DOWNLOAD: THREE icons, one per file, reversing
                              PD-8e's single icon and its <details> menu on the
                              owner's instruction. Only a scored submission has
                              files worth offering, so an unscored row still
                              shows a dash for the whole cell. Within a scored
                              row, a file that does not exist is DIMMED rather
                              than dropped, so every row keeps its shape. */}
                          <td className="px-2.5 py-2">
                            {isScored ? (
                              <SubmissionDownloads
                                sessionId={r.id}
                                hasVideo={r.video_path != null}
                                studentName={r.name}
                              />
                            ) : (
                              <span className="text-content-tertiary">-</span>
                            )}
                          </td>
                        </tr>

                        {/* THE CONFIRM, as its own row spanning all eight
                            columns. It renders nothing unless this row's trigger
                            is the one that is open. This is what stopped the
                            panel being squeezed into the 17% Status column. */}
                        {(isScored || isInterrupted) && (
                          <SubmissionResetConfirmRow
                            sessionId={r.id}
                            studentName={r.name}
                            type={isInterrupted ? "interrupted" : "retake"}
                            colSpan={SUBMISSION_COLUMNS}
                          />
                        )}
                        </Fragment>
                      );
                    })}
                    </SubmissionResetProvider>
                  </tbody>
                </table>
              </div>
              </>
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
