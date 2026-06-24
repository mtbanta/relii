// The results screen: the itemized content score with a short evidence comment
// per item, the full transcript beside it, and a link back home. Server
// Component; reads the student's own session via Row Level Security.
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";
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

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, mode, scenario_id, transcript, score, score_total, video_path")
    .eq("id", id)
    .single();

  if (!session) notFound();

  // Not scored yet? Send them back to the live conversation.
  if (session.status !== "scored" || !session.score) {
    redirect(`/student/session/${id}`);
  }

  const score = session.score as SessionScore;
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

  // Load the scenario + rubric so we can show each item's human-friendly label
  // and category next to its score.
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("title, persona_name, rubric_id")
    .eq("id", session.scenario_id)
    .single();

  const { data: rubric } = await supabase
    .from("rubrics")
    .select("items")
    .eq("id", scenario?.rubric_id)
    .single();

  const rubricItems = (rubric?.items ?? []) as RubricItem[];
  const labelById = new Map(rubricItems.map((i) => [i.id, i]));

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your results</h1>
          <p className="text-sm text-gray-500">
            {scenario?.title ?? "Practice session"}
          </p>
        </div>
        <Link
          href="/student"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Back to home
        </Link>
      </header>

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

      {/* The student's own recording (voice sessions only). */}
      {isVoice && (
        <section className="mb-6">
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
              Your recording could not be saved this time, but your score below
              was saved. You can run another practice if you want a recording.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              No recording was saved for this session (the camera was off).
            </p>
          )}
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* Itemized score */}
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
