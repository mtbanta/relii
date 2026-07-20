// POST /api/session/end
// Body: { sessionId }
// Ends the session, scores the transcript against the content rubric items for
// this scenario's meeting (discovery or presentation) with a single
// low-temperature pass, and saves the itemized score. Both the text and the
// voice+video paths finish here. All writes use the server-only service role.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreTranscriptContent } from "@/lib/scoring";
import { isSubmissionLocked } from "@/lib/submission";
import { prunePractices, deletePracticesForAssignment } from "@/lib/practice";
import { isMeetingType, type RubricItem, type TranscriptTurn } from "@/lib/types";

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
    .select("id, student_id, scenario_id, assignment_id, status, kind, created_at, transcript")
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

  // 5. Load this scenario: whether it has a rubric at all, which meeting it is,
  //    and who the persona is. The rubric decides whether there is anything to
  //    score; the meeting and persona are what the scorer needs if there is.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("rubric_id, meeting_type, persona_name")
    .eq("id", session.scenario_id)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  // 5a. CONVERSATION-ONLY: a scenario with no rubric has nothing to score, so we
  //     stop here. The session is already marked 'completed' above, which is its
  //     terminal state: the transcript is saved (it was saved turn by turn during
  //     the conversation) and so is the recording for voice+video, but no score
  //     JSON, no total, and no scored_at is ever written.
  //
  //     Note this branches on the scenario having NO RUBRIC, never on the status
  //     being 'completed'. Those are different things: a scenario that DOES have
  //     a rubric also sits at 'completed' for the moment between the conversation
  //     ending and the score saving, and it stays there if scoring fails. Keying
  //     off the status would turn a temporary scoring failure into a permanent
  //     "no score" result instead of letting the student end the session again.
  if (scenario.rubric_id === null) {
    // The retention cap still applies, so it has to run on this path too. For a
    // conversation-only case a FINISHED practice is a 'completed' one, since it
    // will never be 'scored'. Best-effort, exactly like the scored path below.
    if (session.kind === "practice" && session.assignment_id) {
      try {
        await prunePractices(admin, user.id, session.assignment_id, "completed");
      } catch (err) {
        console.error("Pruning old conversation-only practices failed:", err);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // The database constrains meeting_type to discovery or presentation, so this
  // should never fail. It is checked anyway because the alternative to failing
  // here is scoring against the wrong meeting's items, which would save a wrong
  // score that looks entirely legitimate. Better to stop and be noticed.
  if (!isMeetingType(scenario.meeting_type)) {
    console.error(
      "Scenario has an unusable meeting_type:",
      session.scenario_id,
      scenario.meeting_type,
    );
    return NextResponse.json(
      { error: "This scenario is not set up for scoring yet." },
      { status: 500 },
    );
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
    score = await scoreTranscriptContent(
      transcript,
      rubricItems,
      scenario.meeting_type,
      scenario.persona_name ?? "the customer",
    );
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

  // For an assignment-linked practice, enforce the retention cap now that this
  // one is finished and scored: keep only the newest few practices for this
  // student and assignment, removing older rows and their recordings. This is
  // best-effort cleanup: the score above is already saved, so a prune failure is
  // logged and never returned to the student.
  if (session.kind === "practice" && session.assignment_id) {
    try {
      await prunePractices(admin, user.id, session.assignment_id, "scored");
    } catch (err) {
      console.error("Pruning old practices failed:", err);
    }
  }

  // For a graded submission, permanently clear this student's practices for this
  // assignment (rows and recordings), now that the official attempt is scored and
  // saved. Best-effort cleanup, exactly like the prune above: the score is already
  // saved, so a cleanup hiccup is logged and never blocks or undoes the submission
  // or costs the student their result. Scoped to (this student, this assignment,
  // kind = practice), so it can never touch the submission itself, another
  // assignment, or another student.
  if (session.kind === "submission" && session.assignment_id) {
    try {
      await deletePracticesForAssignment(admin, user.id, session.assignment_id);
    } catch (err) {
      console.error("Clearing practices on submission failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
