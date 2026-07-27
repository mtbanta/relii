// POST /api/practice/submit
// Body: { sessionId }
//
// Piece 4: a graded submission is no longer a live one-shot attempt. It is a
// completed voice+video practice (one that has an actual recording and a content
// score) that the student promotes out of the practice pool into the graded
// submission for its assignment. This route performs that conversion.
//
// It is student-owned and server-side: the caller can only convert their OWN
// practice, and the write uses the service-role key (data-model decision A). No
// re-score and no file move: the recording is keyed by session id, so it survives
// the conversion in place. The only change is kind (practice -> submission) plus
// stamping the official submission moment; the score, status, and recording are
// left untouched.
//
// One submission per assignment is enforced by the existing partial unique index
// (sessions_one_submission_per_assignment). A second conversion is refused with a
// clean message rather than a raw database error.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // 1. Who is asking? Must be a logged-in user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. Which practice?
  let sessionId: string | undefined;
  try {
    const body = await request.json();
    sessionId = body?.sessionId;
  } catch {
    // fall through to validation
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Load the session and confirm it is THIS student's. A student can only
  //    convert their own practice.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select(
      "id, student_id, kind, status, mode, video_path, assignment_id",
    )
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "Practice not found." }, { status: 404 });
  }
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: "Not your practice." }, { status: 403 });
  }

  // 4. Eligibility. It must be a completed, scored voice+video practice with an
  //    actual recording, linked to an assignment. Each failure gets a clear
  //    message. This mirrors the client-side gate on the student home, but this
  //    is the real enforcement (the client only decides what button to show).
  if (session.kind !== "practice") {
    return NextResponse.json(
      { error: "Only a practice can be submitted as the graded assignment." },
      { status: 409 },
    );
  }
  if (session.status !== "scored") {
    return NextResponse.json(
      { error: "This practice is not finished and scored yet." },
      { status: 409 },
    );
  }
  if (session.mode !== "voice_video") {
    return NextResponse.json(
      { error: "Only a voice + video practice can be submitted for a grade." },
      { status: 409 },
    );
  }
  if (!session.video_path) {
    return NextResponse.json(
      {
        error:
          "This practice has no recording. Turn your camera on and practice again to be eligible.",
      },
      { status: 409 },
    );
  }
  // The conversion is only safe on an assignment-linked practice: a submission
  // must belong to an assignment (data-model constraint), and the FIFO/eligibility
  // rules are all per assignment. A legacy null-assignment practice cannot become
  // a valid submission.
  if (!session.assignment_id) {
    return NextResponse.json(
      {
        error:
          "This practice is not linked to an assignment and cannot be submitted.",
      },
      { status: 409 },
    );
  }

  // 5. The assignment must be GRADABLE: required_mode = voice_video AND its
  //    scenario has a rubric. required_mode is repurposed in Piece 4 (voice_video
  //    means gradable, text means practice-only), and a conversation-only scenario
  //    (no rubric) has nothing to grade.
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id, required_mode, scenario_id")
    .eq("id", session.assignment_id)
    .single();
  if (assignmentError || !assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }
  if (assignment.required_mode !== "voice_video") {
    return NextResponse.json(
      { error: "This assignment is practice only and has nothing to submit." },
      { status: 400 },
    );
  }
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("rubric_id")
    .eq("id", assignment.scenario_id)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }
  if (scenario.rubric_id === null) {
    return NextResponse.json(
      { error: "This assignment is practice only and has nothing to submit." },
      { status: 400 },
    );
  }

  // 6. One submission per assignment. A pre-check gives a clean message; the
  //    partial unique index below is the real backstop against a race.
  const { data: existing } = await admin
    .from("sessions")
    .select("id")
    .eq("student_id", user.id)
    .eq("assignment_id", session.assignment_id)
    .eq("kind", "submission")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted this assignment." },
      { status: 409 },
    );
  }

  // 7. Convert: promote the practice to the graded submission. Keep the existing
  //    score, score_total, status ('scored'), scored_at, and recording untouched;
  //    only change the kind and stamp the official submission moment. No re-score.
  const { error: updateError } = await admin
    .from("sessions")
    .update({ kind: "submission", submitted_at: new Date().toISOString() })
    .eq("id", session.id);
  if (updateError) {
    // 23505 = the one-submission-per-assignment unique index fired (a second
    // conversion landed at the same instant). Surface it cleanly rather than as a
    // raw database error.
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "You have already submitted this assignment." },
        { status: 409 },
      );
    }
    console.error("Converting practice to submission failed:", updateError);
    return NextResponse.json(
      { error: "Could not submit this practice." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sessionId: session.id });
}
