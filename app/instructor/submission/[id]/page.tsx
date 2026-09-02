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
// It is read-only: there are no professor-finalization controls here (confirming
// or adjusting the grade, the emotional-impact critique, a reviewed toggle).
// Those are deliberately held until after Stage 6.
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
import type { RubricItem, SessionScore, TranscriptTurn } from "@/lib/types";
import { buttonClasses } from "@/components/ui/button";
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
      "id, kind, mode, status, student_id, assignment_id, scenario_id, transcript, score, video_path, submitted_at, recorded_seconds, class_id",
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
  const isVoice = session.mode === "voice_video";

  // The student, the assignment, and the scenario + its rubric (for the itemized
  // labels and categories). All read with the admin client on the server.
  const [{ data: student }, { data: assignment }, { data: scenario }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("email, first_name, last_name")
        .eq("id", session.student_id)
        .single(),
      admin
        .from("assignments")
        .select("title")
        .eq("id", session.assignment_id)
        .single(),
      admin
        .from("scenarios")
        .select("title, persona_name, rubric_id")
        .eq("id", session.scenario_id)
        .single(),
    ]);

  // The student's display name, with the email as the fallback. Used in the
  // header and as the label on the student's transcript turns.
  const studentName = student ? displayName(student) : "Unknown student";

  const { data: rubric } = await admin
    .from("rubrics")
    .select("items")
    .eq("id", scenario?.rubric_id)
    .single();

  const rubricItems = (rubric?.items ?? []) as RubricItem[];

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
                {score.total}
                <span className="text-card-title font-normal text-content-secondary">
                  {" "}
                  / {score.max_total}
                </span>
              </p>
            ) : (
              <p className="text-body text-content-secondary">
                Not scored (interrupted submission)
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
              {transcript.map((turn, i) => (
                <div key={i}>
                  <p className="text-meta font-medium text-content-tertiary">
                    {turn.role === "student"
                      ? studentName
                      : scenario?.persona_name ?? "Customer"}
                  </p>
                  <p className="max-w-reading text-body whitespace-pre-wrap text-content-primary">
                    {turn.text}
                  </p>
                </div>
              ))}
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
            of one submission cannot drift apart. */}
        {score && score.items.length > 0 ? (
          <RubricScore items={score.items} rubricItems={rubricItems} />
        ) : (
          <p className="text-body text-content-secondary">
            This submission has no itemized score.
          </p>
        )}
      </section>
    </main>
  );
}
