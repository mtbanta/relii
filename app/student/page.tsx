// The student home page. Shows the student's assignments. Each assignment is the
// graded path (Start assignment) AND the place to practice it: practice is always
// practice FOR an assignment. It confirms the visitor is a logged-in student;
// otherwise it redirects.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { AppHeader } from "@/components/app-header";
import { PracticeButton } from "@/components/practice-button";
import { StartAssignmentButton } from "@/components/start-assignment-button";
import { SubmitPracticeButton } from "@/components/submit-practice-button";
import { PracticeRowActions } from "@/components/practice-row-actions";
import { NameGate } from "@/components/name-gate";
import { ConsentGate } from "@/components/consent-gate";
import { Card, cardClasses } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Icon,
  IconVideo,
  IconMessage,
  IconLock,
} from "@/components/ui/icon";
import { KEPT_PRACTICES } from "@/lib/practice";
import { displayName, hasName } from "@/lib/name";
import { hasConsented } from "@/lib/consent";
import { isLockedUntil, formatAvailableDate } from "@/lib/available-date";
import { resolveMeetingMinutes } from "@/lib/meeting-length";
import {
  RECORDING_LENGTH_LABEL,
  recordingLengthText,
} from "@/lib/recording-length";
// PHASE 4b: formatPoints is a VALUE import beside the type one. See the two
// score lines further down, and Phase 4b handoff item 9.
import { formatPoints } from "@/lib/types";
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
  // PHASE 2b-1: rubric_id is THE ASSIGNMENT'S OWN, and null means this
  // assignment is conversation-only: nothing to grade, so it is practice-only.
  // It used to be read from the scenario. The scenario is still embedded below
  // for its title and persona name, which is all this page needs from it.
  rubric_id: string | null;
  scenarios: {
    title: string;
    persona_name: string;
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
  // ==> PHASE 4a WROTE IT, PHASE 4b READS IT. When an instructor saved a review
  //     of this submission, or null. It is a COLUMN and never a status, so
  //     `status` beside it is untouched and still reads 'scored': a reviewed
  //     submission is still finished, scored work. There is NO matching field
  //     on PracticeRow below, and that absence is the rule rather than an
  //     oversight, because a practice is never reviewed.
  reviewed_at: string | null;
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

  // PHASE 5: the consent gate, and it comes FIRST, ahead of the name gate,
  // because agreeing to the terms is the precondition for using Relii at all.
  // Every student who registers from now on already has a consent row, written
  // with their account in one transaction, so this only fires for an account
  // that predates the click-through. It fails OPEN on a database error, on
  // purpose: see lib/consent.ts.
  if (!(await hasConsented(user.id))) {
    return <ConsentGate email={user.email ?? ""} />;
  }

  // The required name gate: with no name set, the whole home is replaced by the
  // gate, so the Practice and Start buttons below are not rendered and the
  // student cannot start anything until first and last name are entered. It does
  // not return on later visits. A legacy account with no name sees it too.
  if (!hasName(profile)) {
    return <NameGate email={user.email ?? ""} />;
  }

  // GATE 4b: is this student in a class at all?
  //
  // ==> IT SHOULD ALWAYS BE YES, AND THAT IS THE POINT. Every student gets their
  //     membership from the signup rule when they register, and deleting a class
  //     deletes the accounts that belonged only to it rather than leaving them
  //     behind. So this is a message for a state that should not occur: a
  //     deletion that stopped part way through, or a row changed by hand.
  //     Without it, such a student is told "You have no assignments yet. They
  //     will appear here once your instructor creates one", which is untrue and
  //     leaves them waiting for something that will never come. The same state
  //     is surfaced to the super admin as "Students in no class".
  //
  // ==> IT MUST USE THE SERVICE-ROLE KEY, AND THIS IS NOT A SHORTCUT. Gate 1
  //     switched Row Level Security ON for class_members with NO policies, so a
  //     read through the ordinary logged-in client returns zero rows FOR
  //     EVERYBODY. Written that way, this check would tell every student in the
  //     system that they are in no class. It is the same trap Gate 3b named on
  //     the instructor side: a membership read that renders a perfectly healthy
  //     surface as empty. This read is server-side and asks only about the
  //     signed-in user's own membership. <==
  const { count: membershipCount } = await createAdminClient()
    .from("class_members")
    .select("class_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const inNoClass = (membershipCount ?? 0) === 0;

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
    // The SHORT embed form is correct here, and it is safe for a reason rather
    // than by luck: there is exactly ONE foreign key between assignments and
    // scenarios, the composite assignments_scenario_same_class_fkey, which
    // carries the plain reference AND the same-class rule. Gate 4a briefly had
    // two keys between these tables, which made this join ambiguous; Supabase
    // returned an error instead of rows, this line reads only `data`, and the
    // page rendered EMPTY with nothing on screen and nothing in the logs.
    // ==> IF A SECOND FOREIGN KEY IS EVER ADDED BETWEEN THESE TWO TABLES, THIS
    //     LINE BREAKS EXACTLY THAT WAY AGAIN. See PROJECT_STATE Open Issues. <==
    .select("id, title, required_mode, due_at, available_date, duration_minutes, instructions, rubric_id, scenarios ( title, persona_name )")
    .order("available_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .returns<AssignmentRow[]>();

  // Which of those assignments are conversation-only (THE ASSIGNMENT has no
  // rubric, so there is nothing to grade). Used twice below: to decide what a
  // "finished" practice looks like, and to hide the graded controls.
  //
  // PHASE 2b-1: this used to require the scenario to have loaded before it could
  // answer, because the rubric lived on the scenario. The rubric is now a column
  // on the assignment itself, so the embed is no longer part of the decision.
  const conversationOnlyAssignments = new Set(
    (assignments ?? []).filter((a) => a.rubric_id === null).map((a) => a.id),
  );

  // This student's submissions, so we can show each assignment's state. RLS lets
  // a student read only their own sessions.
  const { data: submissions } = await supabase
    .from("sessions")
    // PHASE 4b: reviewed_at joins this read, for the card's Pending Review /
    // Reviewed pill. It lives on sessions, which a student may read their own
    // rows of, so no grant or policy question arises.
    .select(
      "id, assignment_id, status, score_total, score, recorded_seconds, reviewed_at",
    )
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

  // PD-8d: a short-lived signed link per kept recording, so a student can save a
  // practice straight from its row instead of having to open its results page
  // first. This is the SAME pattern the results page already uses: the rows above
  // were read under Row Level Security, so they are provably this student's own,
  // and only then does the admin client mint the links. The service-role key
  // never reaches the browser, no Storage rule changes, and one batch call
  // covers every row on the page rather than one call each.
  const videoPaths = (practices ?? [])
    .map((p) => p.video_path)
    .filter((path): path is string => path != null);
  const signedByPath = new Map<string, string>();
  if (videoPaths.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .createSignedUrls(videoPaths, 60 * 60);
    for (const row of signed ?? []) {
      if (row.path && row.signedUrl) signedByPath.set(row.path, row.signedUrl);
    }
  }

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      {/* PD-8c: the same shell the instructor side uses, so the two surfaces
          read as one product. The wordmark and the compact user block replace
          the stacked title, name and email, which means "Your assignments" is
          now the first real thing on the page rather than the fourth. */}
      <AppHeader
        name={displayName({ ...profile, email: user.email ?? "" })}
        email={user.email ?? ""}
        homeHref="/student"
      />

      <h1 className="mt-4 mb-1 text-page-title font-medium text-content-primary">
        Student home
      </h1>

      <h2 className="mt-5 mb-2 text-section font-medium text-content-secondary">
        Your assignments
      </h2>

      {!assignments || assignments.length === 0 ? (
        inNoClass ? (
          // GATE 4b. A state that should never occur; see the note where
          // inNoClass is worked out. It names the person to ask, because
          // nothing this student can do on their own will change it.
          <p className="text-content-secondary">
            You are not currently in a class, so there is nothing to show here
            yet. Please contact your instructor or administrator.
          </p>
        ) : (
          <p className="text-content-secondary">
            You have no assignments yet. They will appear here once your
            instructor creates one.
          </p>
        )
      ) : (
        <>
          {/* PD-7: a plain, always-on notice for the whole assignments area, so
              a student who finishes a practice or a submission and does not see
              their video, transcript, or score straight away knows it is still
              being processed and is not lost. Static text only: nothing here
              measures or waits on the real processing. */}
          <p
            className={cardClasses({
              tone: "muted",
              padding: "sm",
              className: "mb-4 max-w-reading text-body text-content-secondary",
            })}
          >
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
            // Piece 4, as amended by Phase 2b-1: an assignment is GRADABLE when
            // THE ASSIGNMENT has a rubric (not practice-only) AND its
            // required_mode is voice_video. Only then
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
              <Card
                key={a.id}
                as="li"
                padding="lg"
                tone={locked ? "muted" : "default"}
              >
                {/* Title and one detail line on the left, the card's state as a
                    pill on the right (the mockup's composition). The pill uses
                    SHIPPED wording: the mockup says "Practiced 2 of 3", but the
                    app has always said "Saved practices: 2 of 3", so that string
                    moves up here rather than a second phrasing being invented.
                    It is no longer repeated below. */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3
                      className={`text-card-title font-medium ${locked ? "text-content-tertiary" : "text-content-primary"}`}
                    >
                      {a.title}
                    </h3>
                    <p
                      className={`mt-0.5 text-meta ${locked ? "text-content-tertiary" : "text-content-secondary"}`}
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
                  </div>
                  <span className="shrink-0">
                    {locked ? (
                      <Badge>
                        <Icon icon={IconLock} />
                        Locked
                      </Badge>
                    ) : submitted ? (
                      /* ==> PHASE 4b REPLACED THE GREEN "Submitted" PILL WITH
                             THE REVIEW STATE, AND THE WORD "Submitted" IS NOT
                             LOST: it still opens the summary line below, so the
                             card states it exactly once instead of twice.

                             THE GUARD ON THERE BEING A SCORE MIRRORS THE
                             INSTRUCTOR DASHBOARD EXACTLY, which shows To review
                             / Reviewed on `r.score != null` and not on a
                             status. A submission with NO score is one whose
                             scoring failed; it is not waiting on a review and
                             cannot be reviewed at all, because the instructor's
                             editor needs stored items to put levels against. So
                             it keeps today's green "Submitted" rather than
                             being promised a review nobody can perform.

                             MEASURED BEFORE IT WAS WRITTEN, 2026-09-11: zero
                             submissions in the whole database have a null
                             score, and zero sit at status 'completed'. The
                             guard is therefore unreachable TODAY and is here
                             because a scoring failure creates that state and it
                             is a live entry in Open Issues. <== */
                      submission?.score == null ? (
                        <Badge tone="success">Submitted</Badge>
                      ) : submission.reviewed_at ? (
                        <Badge tone="success">Reviewed</Badge>
                      ) : (
                        <Badge tone="warning">Pending Review</Badge>
                      )
                    ) : interrupted ? (
                      <Badge tone="danger">Interrupted</Badge>
                    ) : (
                      <Badge tone={kept.length > 0 ? "warning" : "neutral"}>
                        Saved practices: {kept.length} of {KEPT_PRACTICES}
                      </Badge>
                    )}
                  </span>
                </div>
                {/* PD-8g: a header over the instructions, so the block reads as
                    something the instructor wrote FOR this assignment rather
                    than as loose prose hanging under the title. It takes the
                    same section heading as "Practice this assignment" further
                    down the card, so the card has one heading style rather than
                    two. It follows the card's locked greying, because a locked
                    card greys as a whole. */}
                {a.instructions && (
                  <div className="mt-3">
                    <p
                      className={`text-body font-medium ${locked ? "text-content-tertiary" : "text-content-primary"}`}
                    >
                      Instructions
                    </p>
                    <p
                      className={`mt-0.5 max-w-reading text-body leading-relaxed ${locked ? "text-content-tertiary" : "text-content-secondary"}`}
                    >
                      {a.instructions}
                    </p>
                  </div>
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
                    <p
                      className={cardClasses({
                        padding: "sm",
                        className:
                          "inline-flex items-center gap-1.5 text-body font-medium text-content-secondary",
                      })}
                    >
                      <Icon icon={IconLock} className="text-content-tertiary" />
                      Locked. Available on {availableOn}.
                    </p>
                  ) : practiceOnly ? (
                    <p className="text-body text-content-secondary">
                      This one is for conversation practice only. There is
                      nothing to submit and no score.
                    </p>
                  ) : submitted ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {/* PD-5: the submission's Recording Length rides on this
                          summary line (this card shows the submission as a line,
                          not as a table row). It is this one submission's own
                          length, never a total across attempts. */}
                      <span className="text-body text-content-success">
                        Submitted
                        {/* ==> PHASE 4b, HANDOFF ITEM 9. These used to
                                interpolate the raw numbers. NOTHING WAS WRONG
                                ON SCREEN: they are JavaScript numbers, so 62.5
                                printed as "62.5" exactly as formatPoints would.
                                It is routed through the helper because 4a's
                                commit asserts that points become text in ONE
                                place, and these were the last two call sites
                                that were not. They now carry REVIEWED totals as
                                well as AI ones. Not a bug fix; the rule
                                catching up with its last exceptions. <== */}
                        {submission?.score_total != null &&
                        submission.score?.max_total != null
                          ? ` · ${formatPoints(submission.score_total)} / ${formatPoints(submission.score.max_total)}`
                          : ""}
                        {` · ${RECORDING_LENGTH_LABEL} ${recordingLengthText(
                          submission?.recorded_seconds,
                        )}`}
                      </span>
                      <Link
                        href={`/student/session/${submission!.id}/results`}
                        className={buttonClasses({ variant: "secondary" })}
                      >
                        View result
                      </Link>
                    </div>
                  ) : interrupted ? (
                    <p className="text-body text-content-warning">
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
                      <p className="mt-2 text-meta text-content-tertiary">
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
                  <div className="mt-5 border-t border-line-tertiary pt-4">
                    <p className="text-body font-medium text-content-primary">
                      Practice this assignment
                    </p>
                    <p className="mt-0.5 text-meta text-content-secondary">
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
                <div className="mt-4 border-t border-line-tertiary pt-3">
                  {/* The count itself now lives in the card's pill above, so it
                      is stated once rather than twice. */}
                  {kept.length > 0 && (
                    <ul className="mt-2 divide-y divide-line-tertiary rounded-md border border-line-tertiary">
                      {kept.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-meta"
                        >
                          {/* The mode icon is decoration beside its own label,
                              so it is aria-hidden and the row still reads as
                              "voice + video" to a screen reader. */}
                          <span className="inline-flex items-center gap-1.5 text-content-primary">
                            <Icon
                              icon={
                                p.mode === "voice_video"
                                  ? IconVideo
                                  : IconMessage
                              }
                              className="text-content-tertiary"
                            />
                            {modeLabel(p.mode)}
                          </span>
                          <span className="text-meta text-content-tertiary">
                            {formatShortDate(p.created_at)}
                          </span>
                          <Badge className="tabular-nums">
                            {practiceOnly
                              ? "no score"
                              : p.score_total != null &&
                                  p.score?.max_total != null
                                ? `${formatPoints(p.score_total)} / ${formatPoints(p.score.max_total)}`
                                : "-"}
                          </Badge>
                          {/* PD-5: how long THIS practice ran. For a voice +
                              video practice with the camera on that is the
                              recording's length; for a text practice, or one
                              where the camera was off, it is the elapsed
                              conversation time. */}
                          <span className="text-meta text-content-secondary">
                            {RECORDING_LENGTH_LABEL}{" "}
                            <span className="tabular-nums">
                              {recordingLengthText(p.recorded_seconds)}
                            </span>
                          </span>
                          {/* PD-8d: Review, Download and Delete as one action
                              group. The download is new here: before this a
                              student had to open the results page to save a
                              practice at all. */}
                          <span className="ml-auto">
                            <PracticeRowActions
                              sessionId={p.id}
                              downloadUrl={
                                p.video_path
                                  ? (signedByPath.get(p.video_path) ?? null)
                                  : null
                              }
                            />
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
                                  <p className="text-content-danger">
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
              </Card>
            );
          })}
          </ul>
        </>
      )}
    </main>
  );
}
