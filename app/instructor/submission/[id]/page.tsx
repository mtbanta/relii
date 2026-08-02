// The instructor's read-only detail view for ONE submission. It shows the
// student, the assignment and scenario, the mode, the total score, the itemized
// rubric score (the same content the student results screen renders), the
// full transcript, and, for a voice+video submission, the recording inline.
//
// Security: this route is gated on the server. It confirms the caller is an
// instructor (read from the database, not trusted from the browser), reads the
// submission with the admin client, and mints the short-lived signed video link
// with the admin client AFTER that gate, exactly the way the student results
// page mints it after its ownership check. So NO Storage rule needs to change.
//
// It is read-only: there are no professor-finalization controls here (confirming
// or adjusting the grade, the emotional-impact critique, a reviewed toggle).
// Those are deliberately held until after Stage 6.
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Confirm the caller is an instructor, read from the database.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "instructor") redirect("/student");

  const admin = createAdminClient();

  // Read the submission with the admin client. It MUST be a submission (never a
  // practice), so a practice session can never be opened through this route.
  const { data: session } = await admin
    .from("sessions")
    .select(
      "id, kind, mode, status, student_id, assignment_id, scenario_id, transcript, score, video_path, submitted_at, recorded_seconds",
    )
    .eq("id", id)
    .eq("kind", "submission")
    .single();

  if (!session) notFound();

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

      {/* The recording (voice+video submissions only). */}
      {isVoice && (
        <section className="mb-6">
          <h2 className="mb-2 text-section font-medium text-content-secondary">Recording</h2>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-w-2xl rounded-lg border border-line-tertiary bg-black"
            />
          ) : (
            <p className="text-body text-content-secondary">
              No recording is attached to this submission.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* The itemized rubric. PD-7 renamed this heading from "Itemized score"
            to "Rubric score", matching the student results page. */}
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

        {/* Transcript */}
        <section>
          <h2 className="mb-2 text-section font-medium text-content-secondary">Transcript</h2>
          {transcript.length > 0 ? (
            <div className={cardClasses({ className: "space-y-3" })}>
              {transcript.map((turn, i) => (
                <div key={i}>
                  <p className="text-meta font-medium text-content-tertiary">
                    {turn.role === "student"
                      ? studentName
                      : scenario?.persona_name ?? "Customer"}
                  </p>
                  <p className="text-body whitespace-pre-wrap text-content-primary">
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
    </main>
  );
}
