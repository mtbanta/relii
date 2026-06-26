// POST /api/chat
// Body: { sessionId, message }
// Appends the student's message, asks the persona (Alex) for an in-character
// reply, saves both to the transcript, and returns the reply. All session
// writes use the server-only service role; the student never writes directly.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatComplete } from "@/lib/openai";
import { buildSystemMessage, transcriptToMessages } from "@/lib/persona";
import { isSubmissionLocked } from "@/lib/submission";
import type { TranscriptTurn } from "@/lib/types";

export async function POST(request: Request) {
  // 1. Must be a logged-in user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. Read and validate the input.
  let sessionId: string | undefined;
  let message: string | undefined;
  try {
    const body = await request.json();
    sessionId = body?.sessionId;
    message = body?.message;
  } catch {
    // fall through
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Load the session and confirm it belongs to this student and is still open.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, scenario_id, status, kind, mode, created_at, transcript")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }
  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: "This session has already ended." },
      { status: 409 },
    );
  }
  // A graded submission whose attempt window has elapsed is locked.
  if (isSubmissionLocked(session)) {
    return NextResponse.json(
      {
        error:
          "This submission was interrupted and is locked. Please contact your instructor.",
      },
      { status: 423 },
    );
  }

  // 4. Load the persona for the system message.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("persona_system_prompt, scenario_context")
    .eq("id", session.scenario_id)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  // 5. Append the student's turn, then ask the persona to reply.
  const transcript = (session.transcript ?? []) as TranscriptTurn[];
  const studentTurn: TranscriptTurn = {
    role: "student",
    text: message.trim(),
    at: new Date().toISOString(),
  };
  const withStudent = [...transcript, studentTurn];

  let reply: string;
  try {
    reply = await chatComplete({
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: buildSystemMessage(
            scenario.persona_system_prompt,
            scenario.scenario_context,
          ),
        },
        ...transcriptToMessages(withStudent),
      ],
    });
  } catch (err) {
    console.error("OpenAI chat failed:", err);
    return NextResponse.json(
      { error: "Alex could not respond. Please try again." },
      { status: 502 },
    );
  }

  const personaTurn: TranscriptTurn = {
    role: "persona",
    text: reply.trim(),
    at: new Date().toISOString(),
  };

  // 6. Save the updated transcript.
  const { error: updateError } = await admin
    .from("sessions")
    .update({ transcript: [...withStudent, personaTurn] })
    .eq("id", session.id);
  if (updateError) {
    console.error("Transcript save failed:", updateError);
    return NextResponse.json(
      { error: "Could not save the conversation." },
      { status: 500 },
    );
  }

  return NextResponse.json({ reply: personaTurn.text });
}
