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
  const labelById = new Map(rubricItems.map((i) => [i.id, i]));

  // PD-5: a submission shows the moment it was handed in (the same stamp the
  // instructor view shows), a practice the moment it was started.
  const takenOn = dateTaken(session);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your results</h1>
          <p className="mt-0.5 text-sm text-gray-700">{displayName(student)}</p>
          {hasName(student) && (
            <p className="text-xs text-gray-400">{user.email}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {scenario?.title ?? "Practice session"}
          </p>
          {/* PD-5: directly under the scenario title, the length of THIS one
              session and the date it was taken. The length is the recording's
              own length when the camera was on, and the elapsed conversation
              time for a text session or a call with the camera off. The date
              matches the one the instructor's submission view shows. */}
          <p className="mt-1 text-xs text-gray-500">
            {RECORDING_LENGTH_LABEL}:{" "}
            <span className="tabular-nums">
              {recordingLengthText(session.recorded_seconds)}
            </span>
          </p>
          {takenOn && (
            <p className="mt-0.5 text-xs text-gray-500">Date Taken: {takenOn}</p>
          )}
        </div>
        <Link
          href="/student"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 print:hidden"
        >
          Back to home
        </Link>
      </header>

      {conversationOnly || !score ? (
        // A conversation-only case has no rubric behind it, so there is nothing
        // to score. Say so plainly, so an unscored result never looks like a
        // score that failed to load.
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <p className="text-sm font-medium">
            Conversation-only practice, no score
          </p>
          <p className="mt-1 text-sm text-gray-600">
            This case is for practising the conversation itself, so it is not
            graded and no score is given. Your full transcript
            {isVoice ? " and recording are" : " is"} saved below.
          </p>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <p className="text-sm text-gray-600">
            Content score ({isVoice ? "voice" : "text"} role-play)
          </p>
          <p className="text-3xl font-semibold">
            {score.total}
            <span className="text-lg font-normal text-gray-500">
              {" "}
              / {score.max_total}
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Scored by AI on the discovery content items. Delivery items (tone,
            pace, and other spoken-only points) are added in a later stage.
          </p>
        </div>
      )}

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
          <h2 className="mb-3 text-lg font-medium">Your recording</h2>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-w-2xl rounded-lg border border-gray-200 bg-black"
            />
          ) : videoError === "1" ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Your recording could not be saved this time, but your{" "}
              {conversationOnly ? "transcript" : "score"} below was saved. You
              can run another practice if you want a recording.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
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
        {/* Itemized score (graded cases only) */}
        {score && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Itemized score</h2>
          <ul className="space-y-3">
            {score.items.map((item) => {
              const meta = labelById.get(item.id);
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-medium">
                      {meta?.label ?? item.id}
                    </h3>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {item.points_earned}/{item.points_max}
                    </span>
                  </div>
                  {meta?.category && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {meta.category}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-600">{item.comment}</p>
                </li>
              );
            })}
          </ul>
        </section>
        )}

        {/* Transcript */}
        <section>
          <h2 className="mb-3 text-lg font-medium">Transcript</h2>
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            {transcript.map((turn, i) => (
              <div key={i}>
                <p className="text-xs font-medium text-gray-400">
                  {turn.role === "student"
                    ? "You"
                    : (scenario?.persona_name ?? "Customer")}
                </p>
                <p className="text-sm whitespace-pre-wrap text-gray-700">
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
