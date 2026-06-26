// POST /api/session/end
// Body: { sessionId }
// Ends the session, scores the transcript against the Discovery content rubric
// with a single low-temperature pass, and saves the itemized score. All writes
// use the server-only service role.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreTranscriptContent } from "@/lib/scoring";
import { isSubmissionLocked } from "@/lib/submission";
import type { RubricItem, TranscriptTurn } from "@/lib/types";

export async function POST(request: Request) {
  // 1. Must be a logged-in user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. Read input.
  let sessionId: string | undefined;
  try {
    const body = await request.json();
    sessionId = body?.sessionId;
  } catch {
    // fall through
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Load the session; confirm ownership.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, scenario_id, status, kind, created_at, transcript")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }
  // Already scored? Treat as success so the client can just show the results.
  if (session.status === "scored") {
    return NextResponse.json({ ok: true });
  }
  // A graded submission whose attempt window has elapsed is locked: do not score
  // an interrupted attempt. Only an instructor can grant a retake.
  if (isSubmissionLocked(session)) {
    return NextResponse.json(
      {
        error:
          "This submission was interrupted and is locked. Please contact your instructor.",
      },
      { status: 423 },
    );
  }

  // 4. Mark completed (the conversation is over).
  await admin
    .from("sessions")
    .update({ status: "completed" })
    .eq("id", session.id);

  // 5. Load the rubric for this scenario.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("rubric_id")
    .eq("id", session.scenario_id)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }
  const { data: rubric, error: rubricError } = await admin
    .from("rubrics")
    .select("items")
    .eq("id", scenario.rubric_id)
    .single();
  if (rubricError || !rubric) {
    return NextResponse.json({ error: "Rubric not found." }, { status: 404 });
  }

  // 6. Score the transcript (content-only) and save the result.
  const transcript = (session.transcript ?? []) as TranscriptTurn[];
  const rubricItems = (rubric.items ?? []) as RubricItem[];

  let score;
  try {
    score = await scoreTranscriptContent(transcript, rubricItems);
  } catch (err) {
    console.error("Scoring failed:", err);
    return NextResponse.json(
      { error: "Could not score the session. Please try again." },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    score,
    score_total: score.total,
    status: "scored",
    scored_at: now,
  };
  // For a graded submission, record the official submission moment too.
  if (session.kind === "submission") {
    update.submitted_at = now;
  }

  const { error: saveError } = await admin
    .from("sessions")
    .update(update)
    .eq("id", session.id);
  if (saveError) {
    console.error("Score save failed:", saveError);
    return NextResponse.json(
      { error: "Could not save the score." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
