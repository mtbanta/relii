// The instructor's read-only detail view for ONE submission. It shows the
// student, the assignment and scenario, the mode, the total score, the itemized
// rubric breakdown (the same content the student results screen renders), the
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
import type { RubricItem, SessionScore, TranscriptTurn } from "@/lib/types";

function modeLabel(mode: string): string {
  return mode === "voice_video" ? "Voice + video" : "Text";
}

// A stored timestamp shown as a plain date and time.
function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
      "id, kind, mode, status, student_id, assignment_id, scenario_id, transcript, score, video_path, submitted_at",
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
      admin.from("profiles").select("email").eq("id", session.student_id).single(),
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

  const { data: rubric } = await admin
    .from("rubrics")
    .select("items")
    .eq("id", scenario?.rubric_id)
    .single();

  const rubricItems = (rubric?.items ?? []) as RubricItem[];
  const labelById = new Map(rubricItems.map((i) => [i.id, i]));

  // Signed video link, minted with the admin client after the instructor gate.
  // The link expires after an hour; reload the page to get a fresh one.
  let videoUrl: string | null = null;
  if (session.video_path) {
    const { data: signed } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .createSignedUrl(session.video_path, 60 * 60);
    videoUrl = signed?.signedUrl ?? null;
  }

  const submittedAt = formatDateTime(session.submitted_at);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Submission</h1>
          <p className="text-sm text-gray-500">
            {student?.email ?? "Unknown student"}
          </p>
        </div>
        <Link
          href={`/instructor?assignment=${session.assignment_id}`}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
      </header>

      {/* Header block: who, what, and the total score. */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              {assignment?.title ?? "Assignment"}
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              {scenario?.title ?? "Scenario"}
              {scenario?.persona_name ? ` (with ${scenario.persona_name})` : ""}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {modeLabel(session.mode)}
              {submittedAt ? ` · submitted ${submittedAt}` : ""}
            </p>
          </div>
          <div className="text-right">
            {score ? (
              <p className="text-3xl font-semibold tabular-nums">
                {score.total}
                <span className="text-lg font-normal text-gray-500">
                  {" "}
                  / {score.max_total}
                </span>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Not scored (interrupted submission)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* The recording (voice+video submissions only). */}
      {isVoice && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-medium">Recording</h2>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-w-2xl rounded-lg border border-gray-200 bg-black"
            />
          ) : (
            <p className="text-sm text-gray-500">
              No recording is attached to this submission.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* Itemized score */}
        <section>
          <h2 className="mb-3 text-lg font-medium">Itemized score</h2>
          {score && score.items.length > 0 ? (
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
          ) : (
            <p className="text-sm text-gray-500">
              This submission has no itemized score.
            </p>
          )}
        </section>

        {/* Transcript */}
        <section>
          <h2 className="mb-3 text-lg font-medium">Transcript</h2>
          {transcript.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              {transcript.map((turn, i) => (
                <div key={i}>
                  <p className="text-xs font-medium text-gray-400">
                    {turn.role === "student"
                      ? student?.email ?? "Student"
                      : scenario?.persona_name ?? "Customer"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-gray-700">
                    {turn.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              This submission has no transcript.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
