// POST /api/voice/start
// Body: { scenarioId }
// Creates a new in-progress VOICE practice session for the logged-in student and
// returns the new session id. Unlike the text demo, Alex's opening line is not
// generated here: in voice mode Alex greets the student live over the audio
// connection, and that greeting is captured into the transcript on the client.
// The session row is written by the server using the service role.
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

  // 2. Which scenario?
  let scenarioId: string | undefined;
  try {
    const body = await request.json();
    scenarioId = body?.scenarioId;
  } catch {
    // fall through to validation below
  }
  if (!scenarioId || typeof scenarioId !== "string") {
    return NextResponse.json({ error: "Missing scenarioId." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Confirm the scenario exists.
  const { data: scenario, error: scenarioError } = await admin
    .from("scenarios")
    .select("id")
    .eq("id", scenarioId)
    .single();
  if (scenarioError || !scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  // 4. Create the session. The schema has no voice-only mode, so we record voice
  // sessions as "voice_video" and leave video_path null until Stage 5 adds the
  // webcam. The transcript starts empty and fills in as the conversation happens.
  const { data: session, error: insertError } = await admin
    .from("sessions")
    .insert({
      student_id: user.id,
      scenario_id: scenario.id,
      kind: "practice",
      mode: "voice_video",
      status: "in_progress",
      transcript: [],
    })
    .select("id")
    .single();

  if (insertError || !session) {
    console.error("Voice session insert failed:", insertError);
    return NextResponse.json(
      { error: "Could not create the session." },
      { status: 500 },
    );
  }

  return NextResponse.json({ sessionId: session.id });
}
