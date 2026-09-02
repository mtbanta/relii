// POST /api/instructor/invite
// Body: { email, role }
//
// GATE 6. Adds ONE address to the invite list for the class the caller is
// working in. This is the single-invite form's write path.
//
// ==> WHY THIS ROUTE EXISTS AT ALL, WHICH IS THE WHOLE POINT OF IT. Until this
//     piece, components/add-email-form.tsx inserted into allowed_emails STRAIGHT
//     FROM THE BROWSER, through Row Level Security. The Gate 3b insert rule is
//     `with check (public.instructs_class(class_id))`, which says nothing
//     whatsoever about `role`. So removing the Instructor option from the
//     dropdown would have been a UI deterrent and NOT a rule: anyone with
//     devtools could still post role = 'instructor' and mint an instructor
//     account, which since Gate 4b is a super admin operation.
//
//     That is privilege escalation, not a data leak, and it is exactly the shape
//     of thing this project deleted in Gate 4a: a convention enforced by
//     nothing. The server has to hold the rule, or Gate 5 would certify a rule
//     that only one of the two invite paths actually enforces. <==
//
// ==> A NOTE FOR A LATER SESSION, SO NOBODY READS A LIVE BACKSTOP AS DEAD CODE.
//     Moving this write to the server leaves the "instructors add to invite
//     list" policy on public.allowed_emails with NO live browser user in the
//     app. DO NOT REMOVE OR RELAX THAT POLICY. It is a backstop against a
//     browser key calling the web API directly, which is precisely the attack it
//     was written for in Gate 3b, and Row Level Security is out of scope for
//     this piece besides. The same is true of the read half, which has had no
//     reader in the app since Gate 3b (the Roster uses the service-role key) and
//     is deliberately still there. <==
//
// THE ROLE RULE: an ordinary instructor may invite students only. A super admin
// keeps both options. Adding an instructor is otherwise an /admin operation, and
// Invite Users was a second path to the same privileged action that bypassed the
// super admin section entirely.
import { NextResponse } from "next/server";
import { requireInstructorRequest, type AdminClient } from "@/lib/class-scope";
import { listInstructorClasses } from "@/lib/instructor-auth";

export async function POST(request: Request) {
  const gate = await requireInstructorRequest("send invites");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId, userId, isSuperAdmin } = gate;

  let rawEmail = "";
  let rawRole = "";
  try {
    const body = await request.json();
    rawEmail = typeof body?.email === "string" ? body.email : "";
    rawRole = typeof body?.role === "string" ? body.role : "";
  } catch {
    // falls through to the checks below
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const role = rawRole.trim().toLowerCase();
  if (role !== "student" && role !== "instructor") {
    return NextResponse.json(
      { error: "Choose a role of student or instructor." },
      { status: 400 },
    );
  }

  // THE RULING, HELD ON THE SERVER. The browser's dropdown is a courtesy on top
  // of this line, not the rule itself.
  if (role === "instructor" && !isSuperAdmin) {
    return NextResponse.json(
      {
        error:
          "Only an administrator can invite an instructor. Ask your administrator to add them.",
      },
      { status: 403 },
    );
  }

  // GATE 3a, write path 2 of 9, now on the server. class_id is what the signup
  // rule in the database reads to put this person into a class the moment they
  // register. The shared guard above already refused a caller with no class, so
  // this can never write an invite that belongs nowhere.
  //
  // ==> added_by IS DELIBERATELY NOT SET, so this route writes EXACTLY the row
  //     the browser form wrote. Moving a write to the server is not a licence to
  //     change what it writes. It would also make a documented fact false
  //     ("single invites never set it", in the added_by note in
  //     app/api/admin/instructor/remove/route.ts and in PROJECT_STATE) and put
  //     more rows behind a foreign key that has no "on delete" rule, for a value
  //     that is informational only. <==
  const { error } = await admin
    .from("allowed_emails")
    .insert({ email, role, class_id: classId });

  if (!error) {
    return NextResponse.json({ ok: true, email, role });
  }

  // 23505 is a duplicate primary key: this address is already in allowed_emails
  // SOMEWHERE, which is not the same as being on a list this instructor can see.
  if (error.code !== "23505") {
    console.error("Adding an invite failed:", email, error);
    return NextResponse.json(
      { error: "Could not add that email. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: await duplicateInviteMessage(admin, userId, email) },
    { status: 409 },
  );
}

// GATE 4a's exact answer, moved to the server and made multi-class correct.
//
// The rule it was built on is unchanged: allowed_emails.email is the PRIMARY
// KEY, so an address belongs to exactly one instructor's invite list, and
// "already on the invite list" is a dead end for the reader when somebody else
// holds it. The app does the diagnosis rather than making the reader do it.
//
// WHAT GATE 6 CHANGED. On the browser this used to need no class comparison at
// all: the Gate 3b read rule meant a browser read could only return rows from a
// class the caller owns, so "a row came back" meant "it is yours". On the server
// with the service-role key that shortcut is gone, so ownership is compared
// explicitly against the caller's own classes.
//
// AND IT NAMES WHICH OF YOUR CLASSES, which is new and is the same fix applied
// one level down. An instructor working in Section 2 who is told an address is
// "on your invite list" now has the same dead end Gate 4a removed, because the
// Roster shows one class at a time. Naming the class leaks nothing: it is a
// class they own.
//
// IT STILL NEVER NAMES THE OTHER INSTRUCTOR OR THEIR CLASS. Knowing an invite
// exists elsewhere is what lets you act; knowing who holds it is not.
async function duplicateInviteMessage(
  admin: AdminClient,
  userId: string,
  email: string,
): Promise<string> {
  const { data, error } = await admin
    .from("allowed_emails")
    .select("class_id")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    // The lookup itself failed, so we genuinely do not know which case this is.
    // Say only what is certain rather than asserting the wrong one.
    return `${email} has already been invited. If they are not on your Roster, ask your administrator.`;
  }

  const owned = await listInstructorClasses(userId);
  const mine = owned.find((c) => c.id === data.class_id);
  if (mine) {
    return `${email} is already on the invite list for your class "${mine.name}".`;
  }
  return `${email} was invited by another instructor, so they cannot be invited again. Ask your administrator.`;
}
