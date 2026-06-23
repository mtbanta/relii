// POST /api/voice/token
// Body: { sessionId }
// Mints a short-lived ephemeral token (client secret) the browser uses to open
// the voice connection to OpenAI. The token carries the Alex persona, the voice,
// and the turn-taking settings, all loaded server-side. The real OpenAI key is
// used only here and never leaves the server.
//
// This is called by the browser right before it connects, not when the session
// is created, because the token expires after about a minute.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemMessage } from "@/lib/persona";
import { mintRealtimeClientSecret } from "@/lib/realtime";

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

  // 3. Load the session; confirm it belongs to this student and is still open.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, scenario_id, status")
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

  // 4. Load the persona for this scenario. We build the exact same instructions
  // the text demo uses (persona prompt + scenario context, with the context
  // fenced off as background only).
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("persona_system_prompt, scenario_context")
    .eq("id", session.scenario_id)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  const instructions = buildSystemMessage(
    scenario.persona_system_prompt,
    scenario.scenario_context,
  );

  // 5. Mint the ephemeral token with the real key (server-side only).
  try {
    const token = await mintRealtimeClientSecret(instructions);
    return NextResponse.json({
      value: token.value,
      expiresAt: token.expiresAt,
      model: token.model,
    });
  } catch (err) {
    console.error("Minting realtime token failed:", err);
    return NextResponse.json(
      { error: "Could not start the voice session. Please try again." },
      { status: 502 },
    );
  }
}
