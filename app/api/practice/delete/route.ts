// POST /api/practice/delete
// Body: { sessionId }
// Deletes ONE of the caller's own practice sessions: its row and, if it has one,
// its recording in Storage. It refuses anything that is not the caller's own
// practice, so it can never delete another student's data or a graded submission.
// Runs server-side with the service-role key, because sessions are server-written
// (data-model decision A) and a database delete does not touch Storage.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePractice } from "@/lib/practice";

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

  // 3. Load the session and confirm it is THIS student's own PRACTICE. Refusing
  //    anything else means a graded submission can never be deleted here, and one
  //    student can never delete another's data.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, kind, video_path")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    return NextResponse.json({ error: "Practice not found." }, { status: 404 });
  }
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: "Not your practice." }, { status: 403 });
  }
  if (session.kind !== "practice") {
    return NextResponse.json(
      { error: "Only practice sessions can be deleted here." },
      { status: 400 },
    );
  }

  // 4. Delete the recording (if any) then the row.
  const result = await deletePractice(admin, {
    id: session.id,
    video_path: session.video_path,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
