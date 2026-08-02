// The results screen: the itemized content score with a short evidence comment
// per item, the full transcript beside it, and a link back home. Server
// Component; reads the student's own session via Row Level Security.
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
import { ResultsActions } from "@/components/results-actions";
import { displayName, hasName } from "@/lib/name";
import { dateTaken } from "@/lib/date-taken";
import {
  RECORDING_LENGTH_LABEL,
  recordingLengthText,
} from "@/lib/recording-length";
import type { RubricItem, SessionScore, TranscriptTurn } from "@/lib/types";
import { cardClasses } from "@/components/ui/card";
import { Icon, IconArrowLeft } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { RubricScore } from "@/components/rubric-score";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ videoError?: string }>;
}) {
  const { id } = await params;
  const { videoError } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The student's own name, for the results header and the printed sheet. RLS
  // only lets a student read this session if it is theirs, so this is the
  // session owner's name. Falls back to email if no name is set.
  const { data: nameProfile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const student = { ...(nameProfile ?? {}), email: user.email ?? "" };

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, kind, status, mode, scenario_id, transcript, score, score_total, video_path, recorded_seconds, submitted_at, created_at",
    )
    .eq("id", id)
    .single();

  if (!session) notFound();

  // The scenario is loaded BEFORE deciding whether to show this page, because
  // whether it has a rubric is what decides which kind of results page this is.
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("title, persona_name, rubric_id")
    .eq("id", session.scenario_id)
    .single();

  // A scenario with NO rubric is conversation-only: it is never scored, so its
  // finished state is 'completed' and there is no score to show. Note this keys
  // on the scenario having no rubric, NOT on the status being 'completed'. A
  // scored case also passes through 'completed', and stays there if its scoring
  // failed; that student must still be sent back to end the session again rather
  // than shown a permanent "no score" page.
  const conversationOnly = scenario?.rubric_id === null;

  if (conversationOnly) {
    // Still talking? Back to the live conversation. Otherwise show the results.
    if (session.status === "in_progress") {
      redirect(`/student/session/${id}`);
    }
  } else if (session.status !== "scored" || !session.score) {
    // Not scored yet? Send them back to the live conversation.
    redirect(`/student/session/${id}`);
  }

  const score = session.score as SessionScore | null;
  const transcript = (session.transcript ?? []) as TranscriptTurn[];
  const isVoice = session.mode === "voice_video";

  // If this session has a recording, mint a short-lived signed link to it. We can
  // safely use the admin client here because we have already confirmed (via the
  // RLS read above) that this user is allowed to see this session. The link
  // expires after an hour; reload the page to get a fresh one.
  let videoUrl: string | null = null;
  if (session.video_path) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .createSignedUrl(session.video_path, 60 * 60);
    videoUrl = signed?.signedUrl ?? null;
  }

  // Load the rubric so we can show each item's human-friendly label and category
  // next to its score. A conversation-only session has no rubric and no itemized
  // score to label, so this is skipped entirely.
  const { data: rubric } = conversationOnly
    ? { data: null }
    : await supabase
        .from("rubrics")
        .select("items")
        .eq("id", scenario?.rubric_id)
        .single();

  const rubricItems = (rubric?.items ?? []) as RubricItem[];

  // PD-5: a submission shows the moment it was handed in (the same stamp the
  // instructor view shows), a practice the moment it was started.
  const takenOn = dateTaken(session);

  return (
    <main className="mx-auto w-full max-w-page px-6 pb-10 pt-5">
      {/* A small accent link, not a bordered button: leaving is not one of this
          page's actions, it is just the way back. */}
      <Link
        href="/student"
        className="mb-3 inline-flex items-center gap-1 text-meta text-content-info hover:underline print:hidden"
      >
        <Icon icon={IconArrowLeft} />
        Back to home
      </Link>

      {/* THE SCORE IS THE SUBJECT OF THIS PAGE. It used to sit in a gray box
          below the header, which made the page lead with who and when rather
          than with how they did. Now it is the header's right-hand side, with
          everything identifying the attempt on the left. */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-line-tertiary pb-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-medium">Your results</h1>
          <p className="mt-0.5 text-body text-content-secondary">
            {scenario?.title ?? "Practice session"}
          </p>
          {/* The mode pill beside the date, and PD-5's Recording Length and Date
              Taken folded into this one line rather than stacked as three. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-content-secondary">
            <Badge tone={isVoice ? "info" : "neutral"}>
              {isVoice ? "Voice + video" : "Text"}
            </Badge>
            {takenOn && <span>{takenOn}</span>}
            <span aria-hidden="true" className="text-content-tertiary">
              &middot;
            </span>
            <span>
              {RECORDING_LENGTH_LABEL}{" "}
              <span className="tabular-nums">
                {recordingLengthText(session.recorded_seconds)}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-micro text-content-tertiary">
            {displayName(student)}
            {hasName(student) ? ` · ${user.email}` : ""}
          </p>
        </div>

        {score && !conversationOnly && (
          <div className="shrink-0 text-right">
            <p className="text-stat font-medium tabular-nums text-content-primary">
              {score.total}
              <span className="text-card-title font-normal text-content-tertiary">
                {" "}
                / {score.max_total}
              </span>
            </p>
            <p className="text-meta font-medium text-content-success">
              {Math.round((score.total / score.max_total) * 100)}%
            </p>
          </div>
        )}
      </header>

      {conversationOnly || !score ? (
        // A conversation-only case has no rubric behind it, so there is nothing
        // to score. Say so plainly, so an unscored result never looks like a
        // score that failed to load.
        <div className={cardClasses({ tone: "muted", className: "mb-5" })}>
          <p className="text-body font-medium">
            Conversation-only practice, no score
          </p>
          <p className="mt-1 text-body text-content-secondary">
            This case is for practising the conversation itself, so it is not
            graded and no score is given. Your full transcript
            {isVoice ? " and recording are" : " is"} saved below.
          </p>
        </div>
      ) : null}

      {/* Save-a-copy controls: download the recording and print/save the score
          and transcript. Read-only; hidden when printing. We pass the same
          signed link the player uses, so no extra access is granted. */}
      <ResultsActions
        downloadUrl={videoUrl}
        isVoice={isVoice}
        filePrefix={session.kind === "submission" ? "relii-submission" : "relii-practice"}
        conversationOnly={conversationOnly}
      />

      {/* The student's own recording (voice sessions only). Hidden when printing
          so the saved PDF is a clean score-and-transcript sheet. */}
      {isVoice && (
        <section className="mb-6 print:hidden">
          <h2 className="mb-2 text-section font-medium text-content-secondary">Your recording</h2>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-w-2xl rounded-lg border border-line-tertiary bg-black"
            />
          ) : videoError === "1" ? (
            <p className="rounded-md border border-amber-300 bg-surface-warning p-3 text-body text-content-warning">
              Your recording could not be saved this time, but your{" "}
              {conversationOnly ? "transcript" : "score"} below was saved. You
              can run another practice if you want a recording.
            </p>
          ) : (
            <p className="text-body text-content-secondary">
              No recording was saved for this session (the camera was off).
            </p>
          )}
        </section>
      )}

      {/* Two columns when there is a score to sit beside the transcript; a
          conversation-only session has none, so the transcript gets the full
          width on its own. */}
      <div
        className={`grid gap-8 print:gap-6 ${
          score ? "md:grid-cols-2 print:grid-cols-1" : ""
        }`}
      >
        {/* The itemized rubric (graded cases only). PD-7 renamed this heading
            from "Itemized score" to "Rubric score", so the student and the
            instructor call the same list of items by the same name. */}
        {score && (
        <section>
          <h2 className="mb-2 text-section font-medium text-content-secondary">Rubric score</h2>
          <RubricScore items={score.items} rubricItems={rubricItems} />
          {/* Kept from the old score box, restyled: it explains why the total is
              out of what it is, which is the first thing a student wonders. */}
          <p className="mt-2 text-micro text-content-tertiary">
            Scored by AI on the discovery content items. Delivery items (tone,
            pace, and other spoken-only points) are added in a later stage.
          </p>
        </section>
        )}

        {/* Transcript */}
        <section>
          <h2 className="mb-2 text-section font-medium text-content-secondary">Transcript</h2>
          <div className={cardClasses({ className: "space-y-3" })}>
            {transcript.map((turn, i) => (
              <div key={i}>
                <p className="text-meta font-medium text-content-tertiary">
                  {turn.role === "student"
                    ? "You"
                    : (scenario?.persona_name ?? "Customer")}
                </p>
                <p className="text-body whitespace-pre-wrap text-content-primary">
                  {turn.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
