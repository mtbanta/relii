// POST /api/instructor/add-student
// Body: { email }
//
// GATE 6. Puts an ALREADY-REGISTERED student into the class the caller is
// working in.
//
// ==> WHY THIS ROUTE IS PART OF THE ISOLATION GATE RATHER THAN A NICETY. Before
//     it, the ONLY things that ever wrote class_members were the signup rule in
//     the database (which fires once, at first registration) and the Gate 3a
//     repair backfill. No route touched it. So a student who ended up in no
//     class was a ONE-WAY DOOR: nobody could put them back, and re-inviting
//     their address created an invite that did nothing, because the signup rule
//     had already fired for them. That gap is what drove Gate 4b's ruling that a
//     class delete must DELETE the student accounts rather than orphan them.
//     This route is the missing half. <==
//
// IT MOVES A STUDENT RATHER THAN COPYING THEM, because a student is in exactly
// ONE class at a time (the owner's ruling, 2026-09-02). That is what keeps
// allowed_emails.email a primary key and keeps the Roster, the export and the
// account-delete guard all agreeing about where a person is.
//
// THE FOUR REFUSALS, and the third is the one that needed a ruling:
//   1. No registered account with that address. Invite them instead.
//   2. Not a student. Instructors are added by the administrator.
//   3. They have done work in the class they would be leaving. See below.
//   4. They belong to a class this instructor does not own. See below.
import { NextResponse } from "next/server";
import { requireInstructorRequest } from "@/lib/class-scope";
import { listInstructorClasses } from "@/lib/instructor-auth";

export async function POST(request: Request) {
  const gate = await requireInstructorRequest("add a student to a class");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, classId, userId } = gate;

  let raw = "";
  try {
    const body = await request.json();
    raw = typeof body?.email === "string" ? body.email : "";
  } catch {
    // falls through to the check below
  }
  const email = raw.trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "Enter the student's email address." },
      { status: 400 },
    );
  }

  // ==> THIS LOOKUP IS DELIBERATELY GLOBAL, AND IT IS THE SAME KIND OF READ AS
  //     THE FOUR WRITTEN OUT AT THE TOP OF lib/class-scope.ts: THE LISTING IS
  //     SCOPED, THE FACT CHECK IS NOT.
  //
  //     "Does an account exist for this address" is a GLOBAL fact. Emails are
  //     unique across the whole system, and the entire purpose of this route is
  //     to act on somebody who is NOT in the caller's class yet, so a scoped
  //     lookup could never find anybody it was meant to find. Nothing read here
  //     is shown to the caller except through the refusals below, none of which
  //     names another instructor or another class. <==
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role, first_name, last_name")
    .eq("email", email)
    .maybeSingle();

  if (targetError) {
    console.error("Looking up a student to add failed:", email, targetError);
    return NextResponse.json(
      { error: "Could not look that address up. Nothing was changed." },
      { status: 500 },
    );
  }
  if (!target) {
    return NextResponse.json(
      {
        error: `No registered account uses ${email}. Invite them on the Invite Users page instead, and they will join this class when they sign up.`,
      },
      { status: 404 },
    );
  }
  if (target.role !== "student") {
    return NextResponse.json(
      {
        error:
          "Only student accounts can be added to a class. Adding an instructor is an administrator action.",
      },
      { status: 403 },
    );
  }

  // Where are they now? class_members is keyed (class_id, user_id) and permits
  // more than one row, so this reads a LIST and never assumes one.
  const { data: memberships, error: membershipError } = await admin
    .from("class_members")
    .select("class_id")
    .eq("user_id", target.id);
  if (membershipError) {
    console.error("Reading a student's memberships failed:", target.id, membershipError);
    return NextResponse.json(
      { error: "Could not check which class they are in. Nothing was changed." },
      { status: 500 },
    );
  }

  const currentClassIds = (memberships ?? []).map((m) => m.class_id as string);

  if (currentClassIds.includes(classId)) {
    return NextResponse.json(
      { ok: true, message: `${email} is already in this class.`, changed: false },
      { status: 200 },
    );
  }

  const owned = await listInstructorClasses(userId);
  const ownedIds = new Set(owned.map((c) => c.id));
  const leaving = currentClassIds.filter((id) => id !== classId);

  // REFUSAL 4. A class this instructor does not own. An ordinary instructor must
  // never be able to pull a student out of somebody else's class: that would be
  // a cross-tenant write, which is exactly what five gate pieces have been
  // closing. It names the administrator and never names the other instructor or
  // their class, the same way Gate 4a's invite messages do.
  const foreign = leaving.filter((id) => !ownedIds.has(id));
  if (foreign.length > 0) {
    console.warn(
      `Gate 6 refused an add-student across instructors: ${target.id} is in class ${foreign[0]}, caller ${userId}.`,
    );
    return NextResponse.json(
      {
        error: `${email} already belongs to another instructor's class, so they cannot be added here. Ask your administrator.`,
      },
      { status: 409 },
    );
  }

  // ==> REFUSAL 3, AND IT IS THE ONE THIS ROUTE EXISTS TO GET RIGHT. A STUDENT'S
  //     PAST WORK DOES NOT MOVE WITH THEM, AND MOVING THEM ANYWAY BREAKS THEIR
  //     OWN VIEW OF IT SILENTLY.
  //
  //     A session takes its class from its SCENARIO (Gate 1's rule), so every
  //     submission and practice they have already done stays in the class they
  //     are leaving. The student surface reads through Row Level Security, and
  //     Gate 3a's read rules are public.can_read_class(class_id), which for a
  //     STUDENT means "am I a member of this class". Take the membership away
  //     and three things go wrong at once, none of them with an error on screen:
  //
  //       1. app/student/page.tsx line 176 reads assignments through the rules,
  //          so their old assignments vanish from their home page.
  //       2. app/student/session/[id]/results/page.tsx line 61 reads the
  //          scenario through the rules, so an old results page loses its title
  //          and persona name.
  //       3. Line 107 of that same page reads the RUBRIC through the rules too,
  //          so the results page loses its ITEM LABELS as well: scores in a
  //          column with nothing beside them saying what was scored.
  //
  //     Number 3 is exactly the silent failure PROJECT_STATE has recorded as the
  //     thing to watch for since Gate 3a, written up there for a scenario and
  //     rubric that diverge across classes. This route could produce it on
  //     purpose, in one click, for a real student's real graded work.
  //
  //     So the move is refused while any of it exists. That keeps this route to
  //     what it is for (adopt an orphan, or fix a section before the work
  //     starts) and never quietly breaks a student's view of their own
  //     submissions. THE OWNER'S RULING, 2026-09-02.
  //
  //     It counts sessions of EVERY kind, practices included: a practice has a
  //     transcript, a score and often a recording, and losing the labels on one
  //     is the same failure as losing them on a submission. <==
  if (leaving.length > 0) {
    const { count, error: workError } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", target.id)
      .in("class_id", leaving);
    if (workError) {
      console.error("Counting a student's work failed:", target.id, workError);
      return NextResponse.json(
        {
          error:
            "Could not check whether they have done any work yet. Nothing was changed.",
        },
        { status: 500 },
      );
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `${email} has already done ${count} role-play${count === 1 ? "" : "s"} in their current class. Moving them would leave that work behind and they would no longer be able to open their own results for it, so it is refused. Ask your administrator.`,
        },
        { status: 409 },
      );
    }
  }

  // ==> THE ORDER OF THE TWO WRITES IS DELIBERATE, AND THESE CANNOT BE ONE
  //     TRANSACTION because they are separate API calls. MEMBERSHIP FIRST, THE
  //     INVITE ROW SECOND, and the reason is which half-done state is safer.
  //
  //     Membership in B with the invite still saying A: Gate 4b's cascade delete
  //     of class A removes the invite row, finds a membership row left over in
  //     another class, and correctly KEEPS the account. Nothing is destroyed.
  //
  //     The other order (invite moved, membership not) leaves a registered
  //     student whose invite backs a class they are not in, and a cascade of
  //     their real class would take the account while the invite row survived
  //     pointing at a class that no longer holds them.
  //
  //     Both steps are safe to repeat, so the message on a partial failure says
  //     to run it again. <==
  if (leaving.length > 0) {
    const { error: removeError } = await admin
      .from("class_members")
      .delete()
      .eq("user_id", target.id)
      .in("class_id", leaving);
    if (removeError) {
      console.error("Removing an old membership failed:", target.id, removeError);
      return NextResponse.json(
        {
          error:
            "Could not take them out of their current class. Nothing was changed.",
        },
        { status: 500 },
      );
    }
  }

  const { error: addError } = await admin
    .from("class_members")
    .insert({ class_id: classId, user_id: target.id });
  if (addError) {
    console.error("Adding a class membership failed:", target.id, addError);
    return NextResponse.json(
      {
        error:
          "Could not add them to this class. They may now be in no class at all; run this again.",
      },
      { status: 500 },
    );
  }

  // The invite row follows the person, or the Roster's pending list, Gate 4b's
  // cascade delete and the class export all disagree about which class they are
  // in. Matching on the profile's own email rather than the typed one, since the
  // profile is the record of who they actually are.
  const { error: inviteError } = await admin
    .from("allowed_emails")
    .update({ class_id: classId })
    .eq("email", target.email.toLowerCase());
  if (inviteError) {
    console.error("Moving the invite row failed:", target.email, inviteError);
    return NextResponse.json(
      {
        error: `${email} is now in this class, but their invite record did not follow. Run this again to finish the move.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    message:
      leaving.length > 0
        ? `${email} moved into this class.`
        : `${email} added to this class.`,
  });
}
