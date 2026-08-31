// POST /api/instructor/uninvite
// Body: { email }
//
// Removes ONE PENDING invite from the invite list (allowed_emails) so that
// address can no longer register. This is strictly for pending invites: an
// email that is on the invite list but has NOT registered yet. A pending invite
// has no account, sessions, or videos, so this is just a single-row delete (no
// Storage, no cascade), which is why it is far lighter than delete-student.
//
// It is guarded the same way delete-student is: the caller must be an instructor
// (role read from the database, never trusted from the browser), and it runs
// server-side only with the service-role key. Before deleting, it VERIFIES the
// email is actually pending (no matching profile). If a profile exists it
// refuses and points the instructor at the student Delete action instead, so
// un-invite can never interfere with a registered user.
import { NextResponse } from "next/server";
import { requireInstructorRequest, refuseOutsideClass } from "@/lib/class-scope";

export async function POST(request: Request) {
  // 1 and 2, plus the caller's class, in one call. GATE 3b replaced the
  // signed-in check and the profiles role check that used to be written out
  // here, and identically in ten sibling routes, with the shared guard in
  // lib/class-scope.ts. It answers the same two questions and one new one:
  // WHICH CLASS may this caller act inside.
  //
  // It cannot be requireInstructor(): that calls redirect(), a page mechanism,
  // which throws here instead of returning a JSON error.
  const gate = await requireInstructorRequest("remove invites");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId } = gate;

  // 3. Read the target email from the request. The invite list stores emails
  //    lowercased (the invite form lowercases before inserting), so we compare
  //    on the lowercased email with an exact match (never a wildcard), the same
  //    way delete-student removes the invite row.
  let rawEmail: string | undefined;
  try {
    const body = await request.json();
    rawEmail = body?.email;
  } catch {
    // fall through to the missing-email check
  }
  if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.trim()) {
    return NextResponse.json({ error: "Missing email." }, { status: 400 });
  }
  const cleanEmail = rawEmail.trim().toLowerCase();

  // 4. The email must actually be on the invite list. If it is not, there is
  //    nothing to un-invite.
  const { data: invite, error: inviteReadError } = await admin
    .from("allowed_emails")
    // GATE 3b: class_id joins this read for the ownership check below.
    .select("email, class_id")
    .eq("email", cleanEmail)
    .maybeSingle();
  if (inviteReadError) {
    console.error("Reading the invite list failed:", inviteReadError);
    return NextResponse.json(
      { error: "Could not read the invite list. Please try again." },
      { status: 500 },
    );
  }
  if (!invite) {
    return NextResponse.json(
      { error: "That email is not on the invite list." },
      { status: 404 },
    );
  }

  // 4b. GATE 3b. The invite must belong to the caller's own class, so one
  //     instructor can never withdraw another instructor's invitation. Same
  //     wording as the line above, so a caller cannot tell "not invited" from
  //     "not yours".
  const outside = refuseOutsideClass(invite.class_id, classId, "invite");
  if (outside) {
    return NextResponse.json(
      { error: "That email is not on the invite list." },
      { status: outside.status },
    );
  }

  // 5. VERIFY IT IS PENDING. The email must NOT belong to a registered user.
  //    profiles.email is stored as the user typed it at signup, so we compare
  //    case-insensitively in code (an exact-but-case-insensitive match, with no
  //    wildcard risk from emails that contain an underscore). At this scale (a
  //    couple dozen users, hundreds at most) reading the emails is trivial.
  //
  //    ==> GATE 3b LEFT THIS READ GLOBAL ON PURPOSE. It is one of the four
  //        places in the app where scoping would be wrong, and the rule is
  //        written out once in lib/class-scope.ts: THE LISTING IS SCOPED, THE
  //        FACT CHECK IS NOT. "Has this address registered" is a global fact
  //        (allowed_emails.email is the primary key, so an address exists once
  //        across the whole system). Scoped to one class, an invited person who
  //        registered as an INSTRUCTOR would read as still pending, because a new
  //        instructor gets a class of their own at signup, and this route would
  //        then happily delete a registered user's invite row. The invite it acts
  //        on is already scoped by the check above; this only decides whether the
  //        deletion is safe. <==
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("email");
  if (profilesError) {
    console.error("Reading profiles failed:", profilesError);
    return NextResponse.json(
      { error: "Could not verify the invite. Please try again." },
      { status: 500 },
    );
  }
  const isRegistered = (profiles ?? []).some(
    (p) => p.email.toLowerCase() === cleanEmail,
  );
  if (isRegistered) {
    return NextResponse.json(
      {
        error:
          "That email belongs to a registered user, so it is not a pending invite. Use the student Delete action instead.",
      },
      { status: 409 },
    );
  }

  // 6. Delete the single invite row. No Storage and no cascade are involved (a
  //    pending invite has no account), so this is one row scoped to this email.
  const { error: deleteError } = await admin
    .from("allowed_emails")
    .delete()
    .eq("email", cleanEmail);
  if (deleteError) {
    console.error("Removing the invite failed:", deleteError);
    return NextResponse.json(
      { error: "Could not remove that invite. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
