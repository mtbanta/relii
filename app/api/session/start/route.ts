// POST /api/session/start
// Body: { scenarioId }
// Creates a new in-progress text practice session for the logged-in student,
// has the persona (Alex) open the meeting, saves that opening line, and returns
// the new session id. Writing the session uses the server-only service role.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatComplete } from "@/lib/openai";
import { buildSystemMessage, OPENING_NUDGE } from "@/lib/persona";
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

  // 2. Which scenario?
  let scenarioId: string | undefined;
  try {
    const body = await request.json();
    scenarioId = body?.scenarioId;
  } catch {
    // fall through to the validation below
  }
  if (!scenarioId || typeof scenarioId !== "string") {
    return NextResponse.json({ error: "Missing scenarioId." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Load the scenario's persona so the AI can open the meeting in character.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("id, persona_system_prompt, scenario_context")
    .eq("id", scenarioId)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  // 4. Ask the persona for a short opening greeting.
  let opening: string;
  try {
    opening = await chatComplete({
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
  } catch (err) {
    console.error("OpenAI opening failed:", err);
    return NextResponse.json(
      { error: "Could not start the conversation. Please try again." },
      { status: 502 },
    );
  }

  // 5. Create the session with the opening line as the first transcript turn.
  const firstTurn: TranscriptTurn = {
    role: "persona",
    text: opening.trim(),
    at: new Date().toISOString(),
  };

  const { data: session, error: insertError } = await admin
    .from("sessions")
    .insert({
      student_id: user.id,
      scenario_id: scenario.id,
      kind: "practice",
      mode: "text",
      status: "in_progress",
      transcript: [firstTurn],
    })
    .select("id")
    .single();

  if (insertError || !session) {
    console.error("Session insert failed:", insertError);
    return NextResponse.json(
      { error: "Could not create the session." },
      { status: 500 },
    );
  }

  return NextResponse.json({ sessionId: session.id });
}
