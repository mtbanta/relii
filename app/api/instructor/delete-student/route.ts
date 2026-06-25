// POST /api/instructor/delete-student
// Body: { studentId }
//
// PERMANENTLY deletes one student and everything attached to them:
//   - their recorded videos in Storage (deleted by hand; Storage is not part of
//     any database cascade),
//   - their login (auth) user, which CASCADES to remove their profile and all
//     their sessions (transcripts and scores) automatically,
//   - their invite-list entry, so the email cannot re-register.
//
// This is destructive, so it runs SERVER-SIDE ONLY with the service-role key
// (never the browser), and it is guarded twice: the caller must be an
// instructor, and the target must be a student (which also blocks deleting
// yourself or another instructor).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_VIDEOS_BUCKET } from "@/lib/storage";

export async function POST(request: Request) {
  // 1. The caller must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. The caller must be an instructor. We verify this on the server against
  //    the database; we never trust the browser to tell us who is an instructor.
  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructors can delete students." },
      { status: 403 },
    );
  }

  // 3. Read the target student id from the request.
  let studentId: string | undefined;
  try {
    const body = await request.json();
    studentId = body?.studentId;
  } catch {
    // fall through to the missing-id check
  }
  if (!studentId || typeof studentId !== "string") {
    return NextResponse.json({ error: "Missing studentId." }, { status: 400 });
  }

  // 3b. Backstop: an instructor can never delete their own account. (The
  //     student-role check below already blocks this, but we guard it directly.)
  if (studentId === user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 403 },
    );
  }

  // 4. Load the target. It must exist and must be a STUDENT. This single rule
  //    prevents deleting instructors (and, with 3b, yourself).
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", studentId)
    .single();
  if (targetError || !target) {
    return NextResponse.json(
      { error: "That student was not found." },
      { status: 404 },
    );
  }
  if (target.role !== "student") {
    return NextResponse.json(
      { error: "Only students can be deleted, not instructors." },
      { status: 403 },
    );
  }

  // 5. STORAGE FIRST. Remove every video file in the student's folder. Their
  //    files live at <studentId>/<sessionId>.webm, so we list that folder and
  //    remove each file by its full path. We do this BEFORE deleting any rows,
  //    so we never leave behind a video whose owning row is already gone.
  const { data: files, error: listError } = await admin.storage
    .from(SESSION_VIDEOS_BUCKET)
    .list(studentId, { limit: 1000 });
  if (listError) {
    console.error("Listing student videos failed:", listError);
    return NextResponse.json(
      { error: "Could not read the student's videos. Nothing was deleted." },
      { status: 500 },
    );
  }
  if (files && files.length > 0) {
    const paths = files.map((f) => `${studentId}/${f.name}`);
    const { error: removeError } = await admin.storage
      .from(SESSION_VIDEOS_BUCKET)
      .remove(paths);
    if (removeError) {
      console.error("Removing student videos failed:", removeError);
      return NextResponse.json(
        {
          error:
            "Could not remove the student's videos. Nothing else was deleted.",
        },
        { status: 500 },
      );
    }
  }

  // 6. Delete the login (auth) user. The database foreign keys are set to
  //    "on delete cascade", so this automatically removes the student's profile
  //    and ALL of their sessions (transcripts and scores). We do not delete
  //    those by hand; the cascade covers them.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(
    studentId,
  );
  if (deleteUserError) {
    console.error("Deleting auth user failed:", deleteUserError);
    return NextResponse.json(
      {
        error:
          "Removed the videos, but could not delete the account. Please try again.",
      },
      { status: 500 },
    );
  }

  // 7. Remove the invite-list entry so this email cannot re-register on its own.
  //    The invite list is keyed by email (lowercased when added), so we match on
  //    the lowercased email. (No wildcard matching, so emails with underscores
  //    are handled correctly.)
  const { error: inviteError } = await admin
    .from("allowed_emails")
    .delete()
    .eq("email", target.email.toLowerCase());
  if (inviteError) {
    console.error("Removing invite-list entry failed:", inviteError);
    return NextResponse.json(
      {
        error:
          "Account deleted, but the email is still on the invite list. Please remove it manually.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
