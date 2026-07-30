// POST /api/assignment/start
// Body: { assignmentId }
// Starts the student's ONE graded submission for an assignment. It creates a
// session with kind = "submission", linked to the assignment, in the mode the
// assignment requires, and opens the matching live screen (text or voice+video).
//
// This is the official, one-shot path. If the student already has a submission
// for this assignment, the server refuses to create another: a finished one
// sends them to their result; an unfinished one is theirs (the session screen
// decides whether it is still live or locked). A database unique index is the
// final backstop against ever creating two. All session writes use the
// server-only service role (data-model decision A).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatComplete } from "@/lib/openai";
import { buildSystemMessage, OPENING_NUDGE } from "@/lib/persona";
import { isLockedUntil, formatAvailableDate } from "@/lib/available-date";
import type { TranscriptTurn } from "@/lib/types";

export async function POST(request: Request) {
  // 1. Who is asking? Must be a logged-in user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. Which assignment?
  let assignmentId: string | undefined;
  try {
    const body = await request.json();
    assignmentId = body?.assignmentId;
  } catch {
    // fall through to validation
  }
  if (!assignmentId || typeof assignmentId !== "string") {
    return NextResponse.json(
      { error: "Missing assignmentId." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 3. Load the assignment: which scenario, and which mode is required.
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id, scenario_id, required_mode, available_date")
    .eq("id", assignmentId)
    .single();
  if (assignmentError || !assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  // 3a. PD-3: an assignment cannot be started before its Available Date. This
  //     route is DORMANT today (the one-shot "Start assignment" button is
  //     disabled since Piece 4), and the check is added anyway so the rule is
  //     already in place if that flow is ever switched back on, rather than
  //     being a hole somebody has to remember later. An empty available date
  //     means available now.
  if (isLockedUntil(assignment.available_date)) {
    return NextResponse.json(
      {
        error: `This assignment is not available until ${formatAvailableDate(assignment.available_date)}.`,
      },
      { status: 403 },
    );
  }

  // 3b. A scenario with NO rubric is conversation-only: there is nothing to
  //     grade, so it can never be submitted. The student home already hides the
  //     graded control for these assignments, but that is only the button; this
  //     is the actual enforcement, refused server-side the way every other
  //     session rule in this app is.
  const { data: gradedCheck, error: gradedCheckError } = await admin
    .from("scenarios")
    .select("rubric_id, enabled")
    .eq("id", assignment.scenario_id)
    .single();
  if (gradedCheckError || !gradedCheck) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  // A turned-off scenario cannot be started at all, graded or not. Checked
  // before the rubric branch below, so a disabled scenario is refused for the
  // same reason whether or not it happens to have a rubric.
  if (!gradedCheck.enabled) {
    return NextResponse.json(
      {
        error:
          "This scenario has been turned off and cannot be started. Please contact your instructor.",
      },
      { status: 403 },
    );
  }

  if (gradedCheck.rubric_id === null) {
    return NextResponse.json(
      {
        error:
          "This is a practice-only assignment with no grade. Use the practice buttons instead.",
      },
      { status: 400 },
    );
  }

  // 4. One submission per assignment per student. If one already exists, do NOT
  //    create another: tell the client where to go instead.
  const existing = await findExistingSubmission(admin, user.id, assignment.id);
  if (existing) {
    return alreadyExistsResponse(existing);
  }

  // 5. Create the one submission, in the assignment's required mode.
  //    Text opens with a generated greeting from the persona (like text
  //    practice); voice+video starts empty and is greeted live on the call.
  const mode = assignment.required_mode as "text" | "voice_video";
  let transcript: TranscriptTurn[] = [];

  if (mode === "text") {
    const { data: scenario, error: scenarioError } = await admin
      .from("scenarios")
      .select("persona_system_prompt, scenario_context")
      .eq("id", assignment.scenario_id)
      .single();
    if (scenarioError || !scenario) {
      return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
    }
    try {
      const opening = await chatComplete({
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: buildSystemMessage(
              scenario.persona_system_prompt,
              scenario.scenario_context,
            ),
          },
          { role: "user", content: OPENING_NUDGE },
        ],
      });
      transcript = [
        { role: "persona", text: opening.trim(), at: new Date().toISOString() },
      ];
    } catch (err) {
      console.error("OpenAI opening failed:", err);
      return NextResponse.json(
        { error: "Could not start the submission. Please try again." },
        { status: 502 },
      );
    }
  }

  const { data: session, error: insertError } = await admin
    .from("sessions")
    .insert({
      student_id: user.id,
      scenario_id: assignment.scenario_id,
      assignment_id: assignment.id,
      kind: "submission",
      mode,
      status: "in_progress",
      transcript,
    })
    .select("id")
    .single();

  if (insertError || !session) {
    // 23505 = the unique index fired: a submission was created at the same
    // instant (a double-start race). Re-read it and route the client there
    // rather than creating a second attempt.
    if (insertError?.code === "23505") {
      const raced = await findExistingSubmission(admin, user.id, assignment.id);
      if (raced) return alreadyExistsResponse(raced);
    }
    console.error("Submission insert failed:", insertError);
    return NextResponse.json(
      { error: "Could not start the submission." },
      { status: 500 },
    );
  }

  return NextResponse.json({ sessionId: session.id, mode });
}

// Look up this student's existing submission for an assignment, if any.
async function findExistingSubmission(
  admin: ReturnType<typeof createAdminClient>,
  studentId: string,
  assignmentId: string,
) {
  const { data } = await admin
    .from("sessions")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .eq("kind", "submission")
    .maybeSingle();
  return data;
}

// Shape the "you already have a submission" answer. A finished one (scored or
// completed) sends the student to their result; an unfinished one sends them to
// the session screen, which shows it live (if still inside the window) or locked.
function alreadyExistsResponse(existing: { id: string; status: string }) {
  const finished = existing.status === "scored" || existing.status === "completed";
  return NextResponse.json(
    {
      error: finished
        ? "You have already submitted this assignment."
        : "You already have a submission in progress for this assignment.",
      state: finished ? "submitted" : "exists",
      sessionId: existing.id,
    },
    { status: 409 },
  );
}
