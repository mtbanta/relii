// Saves the logged-in user's first and last name to their own profile.
//
// This is the ONLY place a name is written. The user id comes from the logged-in
// session cookie (never from the browser), and the write sets only the two name
// columns with the service-role key, so a user can only ever set their OWN name
// and can never touch role, email, or anyone else's row. No browser write rule
// is opened up on profiles; this route is the whole write path (the same pattern
// the delete-student, uninvite, and scaffold routes use).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// A generous cap, so a stray paste cannot store something absurd while leaving
// plenty of room for real names.
const MAX_NAME_LENGTH = 100;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { firstName?: unknown; lastName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName =
    typeof body.lastName === "string" ? body.lastName.trim() : "";

  // Both are required, and neither may be unreasonably long.
  if (
    !firstName ||
    !lastName ||
    firstName.length > MAX_NAME_LENGTH ||
    lastName.length > MAX_NAME_LENGTH
  ) {
    return NextResponse.json(
      { error: "Please enter a valid first and last name." },
      { status: 400 },
    );
  }

  // Write with the service-role key, scoped to THIS user's own row, setting only
  // the two name columns. The id is the authenticated user's, so another user's
  // row can never be reached, and no other field can be changed.
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Could not save your name." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
