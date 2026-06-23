// POST /api/voice/transcript
// Body: { sessionId, transcript: TranscriptTurn[] }
// Saves the spoken transcript for a voice session. In voice mode the audio flows
// directly between the browser and OpenAI, so the words are captured in the
// browser and handed here. The SERVER is still the only writer: it confirms the
// session belongs to this student and is still open, then writes the transcript
// with the service-role key. The browser calls this each time a turn finishes,
// sending the full conversation so far (last write wins), which keeps the turns
// in the right order.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TranscriptTurn } from "@/lib/types";

// Keep only well-formed turns, so a misbehaving client cannot store junk.
function cleanTranscript(input: unknown): TranscriptTurn[] {
  if (!Array.isArray(input)) return [];
  const turns: TranscriptTurn[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const turn = raw as Record<string, unknown>;
    const role = turn.role;
    const text = turn.text;
    const at = turn.at;
    if (role !== "persona" && role !== "student") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    turns.push({
      role,
      text: text.trim(),
      at: typeof at === "string" && at ? at : new Date().toISOString(),
    });
  }
  return turns;
}

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
  let transcriptInput: unknown;
  try {
    const body = await request.json();
    sessionId = body?.sessionId;
    transcriptInput = body?.transcript;
  } catch {
    // fall through
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Load the session; confirm ownership and that it is still open.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, status")
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

  // 4. Save the cleaned transcript.
  const transcript = cleanTranscript(transcriptInput);
  const { error: updateError } = await admin
    .from("sessions")
    .update({ transcript })
    .eq("id", session.id);
  if (updateError) {
    console.error("Voice transcript save failed:", updateError);
    return NextResponse.json(
      { error: "Could not save the conversation." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
