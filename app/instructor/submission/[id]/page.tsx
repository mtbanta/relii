// The instructor's read-only detail view for ONE submission. It shows the
// student, the assignment and scenario, the mode, the total score, the itemized
// rubric score (the same content the student results screen renders), the
// full transcript, and, for a voice+video submission, the recording inline.
//
// Security: this page is gated on the server. It confirms the caller is an
// instructor (read from the database, not trusted from the browser), reads the
// submission with the admin client, CONFIRMS THE SUBMISSION IS IN THE CALLER'S
// OWN CLASS (Gate 3b), and mints the short-lived signed video link with the
// admin client only after all of that, exactly the way the student results page
// mints it after its ownership check. So NO Storage rule needs to change.
//
// GATE 3b: the class check is the whole reason this page is in the piece. The
// service-role client bypasses Row Level Security, so before it, an instructor
// could open ANY student's submission by id and watch the recording. Storage
// cannot help here (it has no instructor rule at all, by design), so the scoping
// is done in this file and the ORDER MATTERS: the refusal is above the
// createSignedUrl call, so a foreign recording is never given a URL at all.
//
// ==> PHASE 4a: IT IS NO LONGER READ-ONLY. The review editor at the bottom is
//     where an instructor confirms the AI's score or overrules a level, and the
//     comment that used to sit here saying those controls were held until after
//     Stage 6 was deleted rather than amended, because a stale sentence saying a
//     control does not exist is worse than no sentence at all.
//
//     WHAT IS STILL HELD FOR 4b: everything the STUDENT sees of a review. Until
//     4b ships, a student whose submission is reviewed sees the changed level
//     under an UNLABELLED AI comment, which reads as though the AI said it. That
//     is why nobody reviews real student work between 4a and 4b. <==
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireInstructor } from "@/lib/instructor-auth";
import { otherOwnedClass } from "@/lib/class-scope";
import { OtherClassNotice } from "@/components/other-class-notice";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { displayName, hasName } from "@/lib/name";
// PD-5 moved this formatting into lib so the student's view of the same session
// shows the same date, in the same shape, without a second copy of the code.
import { formatDateTaken } from "@/lib/date-taken";
import {
  RECORDING_LENGTH_LABEL,
  recordingLengthText,
} from "@/lib/recording-length";
import { formatPoints } from "@/lib/types";
import type {
  RubricCriterion,
  ScoreItem,
  SessionScore,
  TranscriptTurn,
} from "@/lib/types";
import { readAiOriginal } from "@/lib/submission-review";
import { SubmissionReviewForm } from "@/components/submission-review-form";
import type { ReviewLine } from "@/components/submission-review-form";
import { buttonClasses } from "@/components/ui/button";
import { formatElapsed } from "@/lib/app-time";
import { cardClasses } from "@/components/ui/card";
import { Icon, IconArrowLeft } from "@/components/ui/icon";
import { RubricScore } from "@/components/rubric-score";

function modeLabel(mode: string): string {
  return mode === "voice_video" ? "Voice + video" : "Text";
}

export default async function InstructorSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // GATE 3b replaced the hand-written signed-in and role check that used to sit
  // here with the shared requireInstructor(). It does the same two redirects in
  // the same order and ALSO returns the class this instructor owns, which is what
  // the check below compares against.
  // GATE 6 also keeps the class LIST, so a submission in one of this
  // instructor's OTHER classes can be named rather than 404ed.
  const { classId, classes } = await requireInstructor();

  const admin = createAdminClient();

  // Read the submission with the admin client. It MUST be a submission (never a
  // practice), so a practice session can never be opened through this route.
  const { data: session } = await admin
    .from("sessions")
    .select(
      "id, kind, mode, status, student_id, assignment_id, scenario_id, transcript, score, video_path, submitted_at, recorded_seconds, reviewed_at, class_id",
    )
    .eq("id", id)
    .eq("kind", "submission")
    .single();

  if (!session) notFound();

  // GATE 3b, THE GUARD. The submission must belong to the class this instructor
  // owns. FAILS CLOSED: a submission with no class is refused just as firmly as
  // one belonging to somebody else, because "this row belongs to nobody" must
  // never mean "so anybody may have it". After the Gate 3a repair no row is in
  // that state.
  //
  // It is the SAME notFound() the line above uses, deliberately, so that a
  // caller cannot tell an id that does not exist from one that is not theirs.
  if (!classId || session.class_id !== classId) {
    // ==> GATE 6, DESIGN QUESTION A. Before refusing, ask whether this is one of
    //     the caller's OWN other classes. `classes` is the list of classes this
    //     account owns, so a submission belonging to another instructor matches
    //     nothing here and falls straight through to the SAME notFound() with
    //     the SAME wording, which is what keeps Gate 3b's no-leak property
    //     exactly as it was for a stranger. <==
    const elsewhere = otherOwnedClass(session.class_id, classes, classId);
    if (elsewhere) {
      return (
        <OtherClassNotice
          className={elsewhere.name}
          classId={elsewhere.id}
          thing="submission"
        />
      );
    }

    console.warn(
      `Gate 3b refused a cross-class submission view: submission ${id} is in class ${
        session.class_id ?? "none"
      }, caller class ${classId ?? "none"}.`,
    );
    notFound();
  }

  const score = (session.score ?? null) as SessionScore | null;
  const transcript = (session.transcript ?? []) as TranscriptTurn[];
  // Elapsed from the FIRST turn, exactly as the student results page and the
  // .txt download do it. One helper, three surfaces, so they cannot drift.
  const transcriptStart = transcript.length > 0 ? transcript[0].at : null;
  const isVoice = session.mode === "voice_video";

  // The student, the assignment and ITS rubric, and the scenario. All read with
  // the admin client on the server.
  //
  // ==> PHASE 2b-2: THE RUBRIC COMES FROM THE ASSIGNMENT. It used to come from
  //     scenarios.rubric_id. 2b-1 left this page and lib/instructor-submission.ts
  //     on the old source on purpose, so an instructor kept seeing the 32
  //     historical scores with their labels while the student's own results page
  //     had already moved to the assignment. That divergence was temporary and
  //     this closes it. ONE RULE NOW GOVERNS EVERYWHERE: the rubric comes from
  //     the assignment or there is none. <==
  const [{ data: student }, { data: assignment }, { data: scenario }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("email, first_name, last_name")
        .eq("id", session.student_id)
        .single(),
      admin
        .from("assignments")
        .select("title, rubric_id")
        .eq("id", session.assignment_id)
        .single(),
      admin
        .from("scenarios")
        .select("title, persona_name")
        .eq("id", session.scenario_id)
        .single(),
    ]);

  // The student's display name, with the email as the fallback. Used in the
  // header and as the label on the student's transcript turns.
  const studentName = student ? displayName(student) : "Unknown student";

  // ==> THE GUARD ON THIS READ IS LOAD BEARING, NOT DEFENSIVE. The id handed to
  //     .eq() used to be a scenario's rubric, which is not null on any row this
  //     page can reach. It is an ASSIGNMENT's rubric now, and that is null on 32
  //     of the 33 stored scores, so "no rubric" is the COMMON case here rather
  //     than an edge one. <==
  const rubricId = assignment?.rubric_id ?? null;
  const { data: rubric } = rubricId
    ? await admin.from("rubrics").select("items").eq("id", rubricId).single()
    : { data: null };

  const criteria = (rubric?.items ?? []) as RubricCriterion[];

  // ==> PHASE 4a. WHAT THE AI ORIGINALLY SAID, READ WITH THE ADMIN CLIENT AND
  //     SHOWN ONLY HERE. It lives in public.submission_ai_scores rather than on
  //     the session row precisely so that this page can show it and the
  //     student's own page cannot: a student may read every column of their own
  //     sessions row, so anything kept there is published to them.
  //
  //     IT IS NULL UNTIL THE FIRST REVIEW, and that is not a missing value: it
  //     means nobody has overridden anything, so the score ON the row still IS
  //     the AI's. The fallback below reads it from there for exactly that case,
  //     which is why the "AI:" label is never blank on a first review. <==
  const aiOriginal = score ? await readAiOriginal(admin, session.id) : null;

  // ==> WHERE THE "AI:" LABEL IS ALLOWED TO COME FROM, AND THE ONE FALLBACK
  //     THAT WOULD HAVE BEEN A QUIET LIE.
  //
  //     Before the first review there is no stored original, and that is not a
  //     missing value: nothing has been overridden, so the score ON the row IS
  //     the AI's and reading it from there is exactly right.
  //
  //     AFTER a review it is not. Falling back to the row's score once a human
  //     has changed a level would print the INSTRUCTOR'S OWN CHOICE under the
  //     words "AI:", which is the precise shape of mislabel this project keeps
  //     paying for, and it would do it on the one screen whose whole job is
  //     showing a professor what the machine said. So the two cases where the
  //     original cannot be trusted (the read failed, or the row says reviewed
  //     while no original is stored, which no route can produce) render NO
  //     EDITOR and a message, rather than a form full of plausible wrong
  //     labels. <==
  const originalUnavailable =
    score !== null &&
    (aiOriginal === null ||
      !aiOriginal.ok ||
      (aiOriginal.original === null && session.reviewed_at !== null));

  const aiItems: ScoreItem[] =
    aiOriginal && aiOriginal.ok && aiOriginal.original
      ? aiOriginal.original.score.items
      : (score?.items ?? []);
  const aiById = new Map(aiItems.map((i) => [i.id, i]));

  // ==> THE EDITOR'S LINES ARE BUILT FROM THE STORED SCORE, NOT FROM THE RUBRIC,
  //     the same direction components/rubric-score.tsx takes and for the same
  //     reason: the score is the record of what was graded and the rubric is
  //     looked up only to price a level. A criterion the rubric can no longer
  //     explain has no ladder to choose from, so it produces no line, and the
  //     check below turns that into "no editor" rather than a half a form. The
  //     route refuses the same case, so the screen and the server agree. <==
  const criterionById = new Map(criteria.map((c) => [c.id, c]));
  const reviewLines: ReviewLine[] = (score?.items ?? []).flatMap((item) => {
    const criterion = criterionById.get(item.id);
    if (!criterion || !criterion.levels?.length) return [];
    const ai = aiById.get(item.id);
    return [
      {
        id: item.id,
        name: criterion.name,
        description: criterion.description,
        levels: criterion.levels.map((l) => ({ name: l.name, points: l.points })),
        pointsMax: criterion.levels[0].points,
        aiLevel: ai?.level ?? null,
        aiComment: ai?.comment ?? item.comment,
        currentLevel: item.level ?? null,
        currentNote: item.instructor_note ?? "",
      },
    ];
  });
  // Every stored line has to be editable or none is. A partial form would let an
  // instructor save a grade that silently dropped whichever criterion the rubric
  // could not explain.
  const canReview =
    score !== null &&
    score.items.length > 0 &&
    !originalUnavailable &&
    reviewLines.length === score.items.length;
  const reviewedAt = formatDateTaken(session.reviewed_at);

  // Signed video link, minted with the admin client after the instructor gate.
  // The link expires after an hour; reload the page to get a fresh one.
  let videoUrl: string | null = null;
  if (session.video_path) {
    const { data: signed } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .createSignedUrl(session.video_path, 60 * 60);
    videoUrl = signed?.signedUrl ?? null;
  }

  const submittedAt = formatDateTaken(session.submitted_at);

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      {/* An h2, not an h1: the page title in the shared instructor header above
          is the h1. The name and email here are the STUDENT'S, and the header
          above shows the signed-in instructor's, so this one says whose it is.
          The back link returns to Submissions with this assignment selected. */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-page-title font-medium">Submission</h2>
          <p className="text-body text-content-primary">Student: {studentName}</p>
          {student && hasName(student) && (
            <p className="text-meta text-content-tertiary">{student.email}</p>
          )}
        </div>
        <Link
          href={`/instructor?assignment=${session.assignment_id}`}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          <Icon icon={IconArrowLeft} />
          Back to Submissions
        </Link>
      </header>

      {/* Header block: who, what, and the total score. */}
      <div className={cardClasses({ tone: "muted", padding: "lg", className: "mb-6" })}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-body font-medium">
              {assignment?.title ?? "Assignment"}
            </p>
            <p className="mt-0.5 text-body text-content-secondary">
              {scenario?.title ?? "Scenario"}
              {scenario?.persona_name ? ` (with ${scenario.persona_name})` : ""}
            </p>
            <p className="mt-1 text-meta text-content-secondary">
              {modeLabel(session.mode)}
              {submittedAt ? ` · submitted ${submittedAt}` : ""}
            </p>
            {/* PD-5: directly under the date taken. The length of THIS one
                submission: the recording's own length for a voice + video
                submission, and the elapsed conversation time for a text one or
                one recorded with the camera off. It is never a total across the
                student's attempts. */}
            <p className="mt-0.5 text-meta text-content-secondary">
              {RECORDING_LENGTH_LABEL}:{" "}
              <span className="tabular-nums">
                {recordingLengthText(session.recorded_seconds)}
              </span>
            </p>
          </div>
          <div className="text-right">
            {score ? (
              <p className="text-stat font-medium tabular-nums">
                {formatPoints(score.total)}
                <span className="text-card-title font-normal text-content-secondary">
                  {" "}
                  / {formatPoints(score.max_total)}
                </span>
              </p>
            ) : (
              <p className="text-body text-content-secondary">
                Not scored (interrupted submission)
              </p>
            )}
            {/* PHASE 4a. The same two words the dashboard's Status column uses,
                in the same two colours, so a page and a table row cannot tell
                an instructor different things about one submission. The total
                above is the CURRENT one either way: after a review it is the
                instructor's, which is the whole point of a review. */}
            {score && (
              <p
                className={`mt-1 text-meta ${
                  reviewedAt ? "text-content-success" : "text-content-warning"
                }`}
              >
                {reviewedAt ? `Reviewed ${reviewedAt}` : "To review"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Downloads. Each link hits an instructor-gated server route that reads
          the submission with the admin client and streams the file back. The
          video link redirects to a short-lived signed download link; the
          transcript and CSV are built server-side. */}
      <section className="mb-6 rounded-lg border border-line-tertiary p-4">
        <p className="mb-3 text-body font-medium">Downloads</p>
        <div className="flex flex-wrap items-center gap-3">
          {session.video_path ? (
            <a
              href={`/api/instructor/submission/${session.id}/video`}
              className={buttonClasses({ variant: "secondary" })}
            >
              Download video
            </a>
          ) : (
            <span className="text-body text-content-secondary">
              {isVoice
                ? "No recording to download."
                : "No recording (text submission)."}
            </span>
          )}

          <a
            href={`/api/instructor/submission/${session.id}/transcript`}
            className={buttonClasses({ variant: "secondary" })}
          >
            Download transcript
          </a>

          <a
            href={`/api/instructor/submission/${session.id}/csv`}
            className={buttonClasses({ variant: "secondary" })}
          >
            Download scores (CSV)
          </a>
        </div>
      </section>

      {/* PD-8f: THE PLAYER AND THE TRANSCRIPT SIT SIDE BY SIDE, and the rubric
          runs full width beneath them. This is the same arrangement the student
          results page now uses, deliberately: two screens showing the same
          material in two different arrangements was exactly the inconsistency
          this sprint set out to remove, and the collapsible rubric from PD-8d
          reads far better across the full width than in a half column.

          HOW THE HEIGHTS MATCH WITHOUT MEASURING ANYTHING. Both columns are the
          same width, the video is pinned to 16:9, and the transcript's scroll
          box is given the SAME 16:9 ratio, so the two bodies compute to exactly
          the same height and the transcript scrolls inside it. Below md there is
          one column and the transcript is simply full height. */}
      <div
        className={`mb-6 grid gap-6 ${isVoice ? "md:grid-cols-2" : ""}`}
      >
        {isVoice && (
          <section className="min-w-0">
            {/* PD-8g, and the defect is in the FILE rather than the player. A
                browser-made WebM carries no duration in its header (MediaRecorder
                is writing a live stream and cannot know the length in advance),
                so the player's scrubber reads 0:00 until it has seeked to the
                end. sessions.recorded_seconds, captured in PD-5, is the
                authoritative length and now sits beside the player as well as in
                the header block above; preload="metadata" fetches the header
                without pulling the whole recording. No change to the recording
                or upload path. */}
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-section font-medium text-content-secondary">Recording</h2>
              {videoUrl && (
                <span className="text-meta text-content-secondary">
                  {RECORDING_LENGTH_LABEL}:{" "}
                  <span className="tabular-nums">
                    {recordingLengthText(session.recorded_seconds)}
                  </span>
                </span>
              )}
            </div>
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-lg border border-line-tertiary bg-black object-contain"
              />
            ) : (
              <p className="text-body text-content-secondary">
                No recording is attached to this submission.
              </p>
            )}
          </section>
        )}

        {/* Transcript */}
        <section className="min-w-0">
          <h2 className="mb-2 text-section font-medium text-content-secondary">Transcript</h2>
          {transcript.length > 0 ? (
            <div
              className={cardClasses({
                className: `space-y-3 print:aspect-auto print:max-h-none print:overflow-visible ${
                  isVoice ? "md:aspect-video md:overflow-y-auto" : ""
                }`,
              })}
            >
              {transcript.map((turn, i) => {
                // The same elapsed stamp the student sees on their own results
                // page, from the same helper, so the two cannot drift.
                const elapsed = formatElapsed(transcriptStart, turn.at);
                return (
                  <div key={i}>
                    <p className="text-meta font-medium text-content-tertiary">
                      {turn.role === "student"
                        ? studentName
                        : scenario?.persona_name ?? "Customer"}
                      {elapsed && (
                        <span className="ml-2 font-normal tabular-nums">
                          {elapsed}
                        </span>
                      )}
                    </p>
                    <p className="max-w-reading text-body whitespace-pre-wrap text-content-primary">
                      {turn.text}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-body text-content-secondary">
              This submission has no transcript.
            </p>
          )}
        </section>
      </div>

      {/* The itemized rubric, now FULL WIDTH beneath the pair above. PD-7 renamed
          this heading from "Itemized score" to "Rubric score", matching the
          student results page. */}
      <section>
        <h2 className="mb-2 text-section font-medium text-content-secondary">Rubric score</h2>
        {/* The SAME component the student results page uses, so the two views
            of one submission cannot drift apart.

            ==> AND WHEN THE ASSIGNMENT NAMES NO RUBRIC, THIS SAYS SO RATHER THAN
                LISTING THE SCORE UNDER ITS INTERNAL IDS. That is the owner's
                ruling and it is the same answer the student's own page gives
                for the same session, which is the point: 2b-2 exists partly to
                stop these two screens telling different stories about one
                submission. The stored total still shows in the header above,
                because it was really awarded, and the CSV still carries every
                row, with one line in its header block saying the item names in
                it are identifiers. Nothing is hidden; what cannot be labelled
                is simply not dressed up as if it could. <== */}
        {score && score.items.length > 0 ? (
          criteria.length > 0 ? (
            /* ==> PHASE 4b. audience="instructor" CHANGES EXACTLY ONE
                   STRING: a level the review changed reads "Level set in
                   review" here and "Level set by your instructor" on the
                   student's own page. Everything else, the "AI feedback" label
                   and the instructor's note under its own heading, is
                   byte-identical on both screens, because those two labels name
                   whose words follow rather than addressing anybody.
                   IT IS ONE COMPONENT AND MUST STAY ONE. Forking it into an
                   instructor copy and a student copy is what 2b-2 existed to
                   undo: two renderers of one score drift, and then the two
                   screens tell an instructor and their student different
                   stories about one submission. <== */
            <RubricScore
              items={score.items}
              criteria={criteria}
              audience="instructor"
            />
          ) : (
            <p className="text-body text-content-secondary">
              This assignment has no rubric attached, so this score cannot be
              itemized. The total above is the score as it was stored. The
              scores CSV carries the individual rows.
            </p>
          )
        ) : (
          <p className="text-body text-content-secondary">
            This submission has no itemized score.
          </p>
        )}
      </section>

      {/* ==> PHASE 4a. THE REVIEW. It sits BELOW the read-only rubric rather than
          replacing it, on purpose: the section above is what the STUDENT sees,
          and an instructor deciding whether to overrule a level should be
          looking at the same screen the student will.

          PHASE 4b QUALIFIES THAT SENTENCE RATHER THAN LEAVING IT TO READ AS
          MORE THAN IT IS. The section above is now what the student sees WITH
          ONE WORDING DIFFERENCE: the flag on a changed level says "Level set in
          review" here and "Level set by your instructor" there. Same component,
          same order, same labels on the comment and the note. It is written
          down because "this is what the student sees" is the kind of claim that
          quietly stops being true.

          IT RENDERS ONLY WHERE EVERY STORED LINE CAN BE PRICED. Where the
          assignment names no rubric there is no ladder, so there is nothing
          honest to offer and this says so instead. The route refuses that same
          case with its own message, which is what makes this a screen and not a
          rule: a control hidden in front of a route that would have accepted the
          request is a rule enforced by nothing. */}
      {score && score.items.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-section font-medium text-content-secondary">
            Review
          </h2>
          {canReview ? (
            <>
              <p className="mb-2 max-w-reading text-meta text-content-secondary">
                Choose the performance level you think each criterion earned. The
                points come from the rubric, so there is nothing to type. Leaving
                every level as it is and pressing the button records this
                submission as reviewed without changing the grade.
              </p>
              <SubmissionReviewForm
                sessionId={session.id}
                lines={reviewLines}
                maxTotal={score.max_total}
                alreadyReviewed={session.reviewed_at !== null}
              />
            </>
          ) : originalUnavailable ? (
            <p className="max-w-reading text-body text-content-secondary">
              The record of what the AI originally scored could not be read, so
              this submission cannot be reviewed right now. Reload the page. The
              total above is the score as it is currently stored.
            </p>
          ) : (
            <p className="max-w-reading text-body text-content-secondary">
              This score cannot be reviewed, because the assignment has no rubric
              attached and there are therefore no performance levels to choose
              from. The total above is the score as it was stored.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
