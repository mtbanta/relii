// POST /api/voice/video/upload-url
// Body: { sessionId }
// Mints a one-time signed upload link so the browser can send the webcam
// recording straight to private Storage. This bypasses our app's request-size
// limit (large files never pass through the app) and keeps the service-role key
// server-side: the server decides the exact path the file lands at, so the
// student cannot choose where it goes.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET, sessionVideoPath } from "@/lib/storage";
import { isSubmissionLocked } from "@/lib/submission";

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

  // 3. Load the session; confirm it is this student's open voice session.
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, student_id, mode, status, kind, created_at")
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

  // 4. Mint the signed upload link for the canonical path. upsert lets a retry
  //    overwrite cleanly instead of failing on "already exists".
  const path = sessionVideoPath(user.id, session.id);
  const { data: signed, error: signError } = await admin.storage
    .from(SESSION_VIDEOS_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signError || !signed) {
    console.error("Signed upload URL failed:", signError);
    return NextResponse.json(
      { error: "Could not prepare the video upload." },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: signed.path, token: signed.token });
}
