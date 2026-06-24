// POST /api/voice/video/save
// Body: { sessionId }
// Records that the webcam recording was uploaded, by saving its path on the
// session row. The server reconstructs the canonical path itself (it never
// trusts a client-supplied path) and writes it with the service-role key, so the
// server stays the only writer of sessions (data-model decision A).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionVideoPath } from "@/lib/storage";

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

  // 3. Load the session; confirm it is this student's voice session.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, mode")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }
  if (session.mode !== "voice_video") {
    return NextResponse.json(
      { error: "This session has no video." },
      { status: 400 },
    );
  }

  // 4. Save the canonical path on the session row.
  const path = sessionVideoPath(user.id, session.id);
  const { error: updateError } = await admin
    .from("sessions")
    .update({ video_path: path })
    .eq("id", session.id);
  if (updateError) {
    console.error("Saving video_path failed:", updateError);
    return NextResponse.json(
      { error: "Could not save the video." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
