// The student home page. Shows the student's assignments. Each assignment is the
// graded path (Start assignment) AND the place to practice it: practice is always
// practice FOR an assignment. It confirms the visitor is a logged-in student;
// otherwise it redirects.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { PracticeButton } from "@/components/practice-button";
import { StartAssignmentButton } from "@/components/start-assignment-button";
import { SubmitPracticeButton } from "@/components/submit-practice-button";
import { DeletePracticeButton } from "@/components/delete-practice-button";
import { NameGate } from "@/components/name-gate";
import { KEPT_PRACTICES } from "@/lib/practice";
import { displayName, hasName } from "@/lib/name";
import { isLockedUntil, formatAvailableDate } from "@/lib/available-date";
import { resolveMeetingMinutes } from "@/lib/meeting-length";
import {
  RECORDING_LENGTH_LABEL,
  recordingLengthText,
} from "@/lib/recording-length";
import type { SessionScore } from "@/lib/types";

// Friendly label for a stored mode value.
function modeLabel(mode: string): string {
  return mode === "voice_video" ? "voice + video" : "text";
}

// Show a stored timestamp as a plain date (read in UTC so a date picked as
// "Aug 14" always shows as "Aug 14").
function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Short month + day for a practice's date (e.g. "Jun 9").
function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type AssignmentRow = {
  id: string;
  title: string;
  required_mode: string;
  due_at: string | null;
  // available_date is when the assignment UNLOCKS. Null means available now, so
  // assignments created before PD-3 simply appear immediately.
  available_date: string | null;
  // duration_minutes is how long the role-play meeting runs (PD-4). Null means
  // the standard 30 minutes, which is what resolveMeetingMinutes returns, so the
  // card shows the same number the clock actually counts up to. PD-7 added this
  // to the query: the duration already reached the session page, but not here.
  duration_minutes: number | null;
  instructions: string | null;
  // rubric_id is null for a conversation-only case: nothing to grade, so the
  // assignment is practice-only.
  scenarios: {
    title: string;
    persona_name: string;
    rubric_id: string | null;
  } | null;
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  status: string;
  score_total: number | null;
  score: SessionScore | null;
  // PD-5: how long THIS ONE session ran, in seconds. Null on anything finished
  // before PD-5 shipped, which shows as a dash.
  recorded_seconds: number | null;
};

type PracticeRow = {
  id: string;
  assignment_id: string;
  mode: string;
  status: string;
  score_total: number | null;
  score: SessionScore | null;
  // video_path is set only when the camera was on and the recording uploaded.
  // Piece 4 uses it to decide whether a voice+video practice is eligible to be
  // submitted as the graded assignment.
  video_path: string | null;
  created_at: string;
  // PD-5: this practice's own Recording Length, in seconds. Never a total.
  recorded_seconds: number | null;
};

export default async function StudentHome() {
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

  // Instructors who land here get sent to their own page.
  if (profile?.role !== "student") {
    redirect("/instructor");
  }

  // The required name gate: with no name set, the whole home is replaced by the
  // gate, so the Practice and Start buttons below are not rendered and the
  // student cannot start anything until first and last name are entered. It does
  // not return on later visits. A legacy account with no name sees it too.
  if (!hasName(profile)) {
    return <NameGate email={user.email ?? ""} />;
  }

  // The assignments this student can do, with each one's scenario embedded.
  //
  // Ordered by AVAILABLE DATE, soonest first, so the semester reads in the order
  // it happens. Nulls come FIRST on purpose: a null available date means
  // "available now", so those sit at the very top, above assignments with a real
  // date (including ones whose date has already passed). Nulls-first has to be
  // asked for explicitly, because an ascending sort puts them last by default,
  // which would bury every assignment created before PD-3 at the bottom.
  // created_at is the tiebreaker, so assignments sharing a date (or both empty)
  // keep the newest-first order the page used before.
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, required_mode, due_at, available_date, duration_minutes, instructions, scenarios ( title, persona_name, rubric_id )")
    .order("available_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

  // Which of those assignments are conversation-only (their scenario has no
  // rubric, so there is nothing to grade). Used twice below: to decide what a
  // "finished" practice looks like, and to hide the graded controls.
  const conversationOnlyAssignments = new Set(
    (assignments ?? [])
      .filter((a) => a.scenarios != null && a.scenarios.rubric_id === null)
      .map((a) => a.id),
  );

  // This student's submissions, so we can show each assignment's state. RLS lets
  // a student read only their own sessions.
  const { data: submissions } = await supabase
    .from("sessions")
    .select("id, assignment_id, status, score_total, score, recorded_seconds")
    .eq("student_id", user.id)
    .eq("kind", "submission")
    .returns<SubmissionRow[]>();

  const submissionByAssignment = new Map<string, SubmissionRow>();
  for (const s of submissions ?? []) {
    if (s.assignment_id) submissionByAssignment.set(s.assignment_id, s);
  }

  // This student's kept practices: the FINISHED ones, newest first. We group them
  // per assignment for the "Saved practices: X of 3" list. Legacy practice rows
  // with no assignment link are ignored (they never appear here).
  //
  // "Finished" depends on the assignment. A graded case's practice is finished
  // when it has been SCORED. A conversation-only case is never scored, so its
  // practice is finished when the conversation is over ('completed'). We fetch
  // both statuses and then keep only the right one per assignment, which matters:
  // a graded practice sitting at 'completed' is one whose SCORING FAILED, and it
  // must stay out of this list exactly as it does today.
  const { data: practices } = await supabase
    .from("sessions")
    .select(
      "id, assignment_id, mode, status, score_total, score, video_path, created_at, recorded_seconds",
    )
    .eq("student_id", user.id)
    .eq("kind", "practice")
    .in("status", ["scored", "completed"])
    .not("assignment_id", "is", null)
    .order("created_at", { ascending: false })
    .returns<PracticeRow[]>();

  const practicesByAssignment = new Map<string, PracticeRow[]>();
  for (const p of practices ?? []) {
    if (!p.assignment_id) continue;
    const finishedStatus = conversationOnlyAssignments.has(p.assignment_id)
      ? "completed"
      : "scored";
    if (p.status !== finishedStatus) continue;
    const list = practicesByAssignment.get(p.assignment_id) ?? [];
    list.push(p);
    practicesByAssignment.set(p.assignment_id, list);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Student home</h1>
          <p className="text-sm text-gray-700">
            {displayName({ ...profile, email: user.email ?? "" })}
          </p>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <h2 className="mb-3 text-lg font-medium">Your assignments</h2>

      {!assignments || assignments.length === 0 ? (
        <p className="text-gray-600">
          You have no assignments yet. They will appear here once your instructor
          creates one.
        </p>
      ) : (
        <>
          {/* PD-7: a plain, always-on notice for the whole assignments area, so
              a student who finishes a practice or a submission and does not see
              their video, transcript, or score straight away knows it is still
              being processed and is not lost. Static text only: nothing here
              measures or waits on the real processing. */}
          <p className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            After you finish a practice or a submission, video and transcript
            processing may take up to three minutes.
          </p>

          <ul className="space-y-4">
          {assignments.map((a) => {
            const due = formatDueDate(a.due_at);
            const submission = submissionByAssignment.get(a.id);
            const submitted =
              submission?.status === "scored" ||
              submission?.status === "completed";
            const interrupted = submission?.status === "in_progress";
            const kept = practicesByAssignment.get(a.id) ?? [];
            const practiceOnly = conversationOnlyAssignments.has(a.id);
            // Piece 4: an assignment is GRADABLE when its scenario has a rubric
            // (not practice-only) AND its required_mode is voice_video. Only then
            // can a completed voice+video practice be submitted as the graded
            // assignment. `hasSubmission` gates the submit control on ANY
            // submission row already existing (even a legacy in_progress one),
            // since the one-submission unique index would block a second anyway.
            const gradable = !practiceOnly && a.required_mode === "voice_video";
            const hasSubmission = submission != null;
            // PD-3: before its Available Date an assignment is LOCKED. It is
            // still listed (so the student can see what is coming) but grayed,
            // with no way to practice it and no way to submit it. A null or past
            // Available Date is unlocked and behaves exactly as it did before.
            // The lock is decided when the page loads, so an assignment that
            // opens while the student is looking at it appears on their next
            // visit or refresh. The server routes enforce the same rule, so this
            // is the display half of it, not the whole of it.
            const locked = isLockedUntil(a.available_date);
            const availableOn = formatAvailableDate(a.available_date);
            // PD-7: how long this assignment's meeting runs, shown the same way
            // the instructor's assignment card shows it. It is ALWAYS shown,
            // including when nothing is set: a null duration is not "no meeting
            // length", it is the standard 30 minutes, and 30 is exactly what the
            // student's clock will count up to.
            const meetingMinutes = resolveMeetingMinutes(a.duration_minutes);

            return (
              <li
                key={a.id}
                className={`rounded-lg border border-gray-200 p-5 ${locked ? "bg-gray-50" : ""}`}
              >
                <h3 className={`font-semibold ${locked ? "text-gray-400" : ""}`}>
                  {a.title}
                </h3>
                <p
                  className={`mt-0.5 text-sm ${locked ? "text-gray-400" : "text-gray-500"}`}
                >
                  {a.scenarios?.title ?? "Scenario"}
                  {a.scenarios?.persona_name
                    ? ` (with ${a.scenarios.persona_name})`
                    : ""}{" "}
                  &middot;{" "}
                  {practiceOnly
                    ? "practice only, not graded"
                    : `${modeLabel(a.required_mode)} required`}
                  {` · ${meetingMinutes} min meeting`}
                  {due ? ` · due ${due}` : ""}
                </p>
                {a.instructions && (
                  <p
                    className={`mt-3 text-sm leading-relaxed ${locked ? "text-gray-400" : "text-gray-700"}`}
                  >
                    {a.instructions}
                  </p>
                )}

                {/* The official, one-shot graded submission. A conversation-only
                    case has no rubric, so there is nothing to grade and no
                    graded path at all: it is practice only.

                    PD-3: a LOCKED assignment shows the unlock date here instead
                    of any control. It is gated on there being no submission row
                    at all (rather than on "not submitted yet"), so if an
                    assignment the student has already worked on is later moved
                    to a future date, their finished result and any interrupted
                    attempt still show. The lock stops NEW practice and NEW
                    submitting; it never hides work already done. */}
                <div className="mt-4">
                  {locked && !hasSubmission ? (
                    <p className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500">
                      Locked. Available on {availableOn}.
                    </p>
                  ) : practiceOnly ? (
                    <p className="text-sm text-gray-600">
                      This one is for conversation practice only. There is
                      nothing to submit and no score.
                    </p>
                  ) : submitted ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {/* PD-5: the submission's Recording Length rides on this
                          summary line (this card shows the submission as a line,
                          not as a table row). It is this one submission's own
                          length, never a total across attempts. */}
                      <span className="text-sm text-green-700">
                        Submitted
                        {submission?.score_total != null &&
                        submission.score?.max_total != null
                          ? ` · ${submission.score_total} / ${submission.score.max_total}`
                          : ""}
                        {` · ${RECORDING_LENGTH_LABEL} ${recordingLengthText(
                          submission?.recorded_seconds,
                        )}`}
                      </span>
                      <Link
                        href={`/student/session/${submission!.id}/results`}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        View result
                      </Link>
                    </div>
                  ) : interrupted ? (
                    <p className="text-sm text-amber-800">
                      Your submission was interrupted. A graded submission is a
                      one-time attempt and cannot be resumed. Please contact your
                      instructor to have it reset.
                    </p>
                  ) : (
                    <>
                      {/* Piece 4: the one-shot "Start assignment" flow is
                          disabled (grayed, unclickable) but kept intact. A
                          graded submission is now made by submitting a completed
                          voice + video practice from the list below. */}
                      <StartAssignmentButton assignmentId={a.id} disabled />
                      <p className="mt-2 text-xs text-gray-400">
                        Start assignment is temporarily disabled.
                      </p>
                    </>
                  )}
                </div>

                {/* Practice this assignment (unlimited; only before submitting,
                    and only once it is available). The student picks the mode
                    each time. PD-3: on a locked assignment the practice buttons
                    are not rendered at all, so there is nothing to click. */}
                {!submitted && !locked && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <p className="text-sm font-medium">Practice this assignment</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Practice as many times as you like. We keep your last{" "}
                      {KEPT_PRACTICES}.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <PracticeButton assignmentId={a.id} mode="text" />
                      <PracticeButton assignmentId={a.id} mode="voice" />
                    </div>
                  </div>
                )}

                {/* Saved practices: the kept, reviewable ones. On a LOCKED
                    assignment this whole section is hidden UNLESS the student
                    actually has practices for it (which only happens if an
                    already-open assignment was later moved to a future date), so
                    a normal locked card reads clean and no existing work is ever
                    hidden from the student who did it. */}
                {(!locked || kept.length > 0) && (
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="text-sm text-gray-600">
                    Saved practices: {kept.length} of {KEPT_PRACTICES}
                  </p>
                  {kept.length > 0 && (
                    <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                      {kept.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                        >
                          <span className="text-gray-700">
                            {modeLabel(p.mode)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatShortDate(p.created_at)}
                          </span>
                          <span className="tabular-nums text-gray-600">
                            {practiceOnly
                              ? "no score"
                              : p.score_total != null &&
                                  p.score?.max_total != null
                                ? `${p.score_total} / ${p.score.max_total}`
                                : "-"}
                          </span>
                          {/* PD-5: how long THIS practice ran. For a voice +
                              video practice with the camera on that is the
                              recording's length; for a text practice, or one
                              where the camera was off, it is the elapsed
                              conversation time. */}
                          <span className="text-xs text-gray-500">
                            {RECORDING_LENGTH_LABEL}{" "}
                            <span className="tabular-nums">
                              {recordingLengthText(p.recorded_seconds)}
                            </span>
                          </span>
                          <span className="ml-auto flex items-center gap-3">
                            <Link
                              href={`/student/session/${p.id}/results`}
                              className="text-xs text-gray-600 hover:underline"
                            >
                              Review
                            </Link>
                            <DeletePracticeButton sessionId={p.id} />
                          </span>

                          {/* Piece 4: submit this completed practice as the
                              graded assignment. Only on a gradable assignment
                              (voice+video required, has a rubric) with no
                              submission yet, and only for a voice+video practice.
                              A voice+video practice with no recording (camera off
                              or a failed upload) shows the red warning instead;
                              text practices show nothing. PD-3 adds one more
                              condition: never while the assignment is locked. */}
                          {gradable &&
                            !hasSubmission &&
                            !locked &&
                            p.mode === "voice_video" && (
                              <div className="w-full">
                                {p.video_path ? (
                                  <SubmitPracticeButton
                                    sessionId={p.id}
                                    scoreTotal={p.score_total}
                                    scoreMax={p.score?.max_total ?? null}
                                  />
                                ) : (
                                  <p className="text-red-600">
                                    Camera must be toggled on in order to be
                                    eligible for submission.
                                  </p>
                                )}
                              </div>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                )}
              </li>
            );
          })}
          </ul>
        </>
      )}
    </main>
  );
}
