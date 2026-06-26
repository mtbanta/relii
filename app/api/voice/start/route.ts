// POST /api/voice/start
// Body: { assignmentId }
// Creates a new in-progress VOICE practice session for the logged-in student,
// tied to the given assignment (practice is always practice FOR an assignment).
// It uses that assignment's scenario. Unlike the text demo, the persona's opening
// line is not generated here: in voice mode Alex greets the student live over the
// audio connection, and that greeting is captured into the transcript on the
// client. The session row is written by the server using the service role.
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

  // 2. Which assignment is being practiced?
  let assignmentId: string | undefined;
  try {
    const body = await request.json();
    assignmentId = body?.assignmentId;
  } catch {
    // fall through to validation below
  }
  if (!assignmentId || typeof assignmentId !== "string") {
    return NextResponse.json(
      { error: "Missing assignmentId." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 3. Load the assignment to find which scenario it practices.
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id, scenario_id")
    .eq("id", assignmentId)
    .single();
  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: "Assignment not found." },
      { status: 404 },
    );
  }

  // 4. Create the session, linked to the assignment. The schema has no
  //    voice-only mode, so we record voice sessions as "voice_video" and leave
  //    video_path null until the webcam upload saves it. The transcript starts
  //    empty and fills in as the conversation happens.
  const { data: session, error: insertError } = await admin
    .from("sessions")
    .insert({
      student_id: user.id,
      scenario_id: assignment.scenario_id,
      assignment_id: assignment.id,
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
