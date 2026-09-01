// POST /api/admin/instructor/remove
// Body: { instructorId, confirm: "REMOVE" }
//
// Permanently deletes one INSTRUCTOR account. Super admin only.
//
// ==> IT REFUSES WHILE THEY STILL OWN A CLASS, and that refusal is the database's
//     own rule surfaced rather than hidden. classes.instructor_id is
//     "on delete restrict" (supabase/gate-1-class-spine.sql), so deleting the
//     account of a class owner fails with a foreign key error. Gate 1 chose that
//     deliberately: an instructor account going away must never silently destroy
//     a class full of graded student work, and must not leave it ownerless
//     either. So the class is dealt with FIRST, by reassigning it (which
//     destroys nothing and is the usual answer) or by the export-first cascade
//     delete (the last resort). Then the account can go. <==
//
// WHAT REMOVING THE ACCOUNT DOES NOT DESTROY: anything they made. created_by on
// rubrics, scenarios and assignments is "on delete set null", so a reassigned
// class keeps every persona and assignment they wrote; those rows simply stop
// naming an author.
import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/super-admin";

// The same word as the class delete. They sit on different screens, the class
// delete additionally requires a fresh export token that only the export route
// can issue, and this one requires the class to be gone first, so the two cannot
// be reached by the same reflex.
const CONFIRM_WORD = "REMOVE";

export async function POST(request: Request) {
  const gate = await requireSuperAdminRequest("remove an instructor");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { admin, userId } = gate;

  let instructorId = "";
  let confirm = "";
  try {
    const body = await request.json();
    instructorId = typeof body?.instructorId === "string" ? body.instructorId : "";
    confirm = typeof body?.confirm === "string" ? body.confirm : "";
  } catch {
    // falls through
  }

  if (confirm !== CONFIRM_WORD) {
    return NextResponse.json(
      { error: `Type ${CONFIRM_WORD} to confirm.` },
      { status: 400 },
    );
  }
  if (!instructorId) {
    return NextResponse.json({ error: "Missing instructor." }, { status: 400 });
  }
  if (instructorId === userId) {
    return NextResponse.json(
      { error: "You cannot remove your own account." },
      { status: 403 },
    );
  }

  // The target must exist and must be an instructor. A student is removed by
  // their own instructor from the Roster, or with the class they belong to.
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", instructorId)
    .maybeSingle();
  if (targetError || !target) {
    return NextResponse.json({ error: "That instructor was not found." }, { status: 404 });
  }
  if (target.role !== "instructor") {
    return NextResponse.json(
      { error: "Only instructor accounts are removed here." },
      { status: 403 },
    );
  }

  // They must own no class. Checked here so the message is readable; the
  // database would refuse anyway, with a foreign key error nobody can act on.
  const { data: owned, error: ownedError } = await admin
    .from("classes")
    .select("id, name")
    .eq("instructor_id", instructorId);
  if (ownedError) {
    return NextResponse.json(
      { error: "Could not check what this instructor owns. Nothing was changed." },
      { status: 500 },
    );
  }
  if ((owned ?? []).length > 0) {
    const names = (owned ?? []).map((c) => `"${c.name}"`).join(", ");
    return NextResponse.json(
      {
        error: `${target.email} still owns ${names}. Hand the class to another instructor, or export and delete it, before removing the account.`,
      },
      { status: 409 },
    );
  }

  // ==> THE STEP WITHOUT WHICH THE DELETE BELOW FAILS, and it is not obvious.
  //     allowed_emails.added_by references auth.users with NO "on delete" rule
  //     at all, which means NO ACTION: Postgres refuses to delete a user whose
  //     id is still sitting in that column. The bulk invite route records
  //     added_by on every row it creates, so an instructor who imported a CSV
  //     into a class that was later REASSIGNED (rather than deleted) leaves
  //     exactly those rows behind, still pointing at them.
  //
  //     Blanking the column is the right repair rather than a schema change:
  //     added_by is informational, it is already nullable (single invites never
  //     set it), and every other author column in this schema is "on delete set
  //     null", so this does by hand what the rest of the schema does by rule.
  //     Changing the constraint instead would be altering a foreign key on a
  //     table this piece was not asked to touch. <==
  const { error: authorError } = await admin
    .from("allowed_emails")
    .update({ added_by: null })
    .eq("added_by", instructorId);
  if (authorError) {
    console.error("Clearing added_by failed:", instructorId, authorError);
    return NextResponse.json(
      {
        error:
          "Could not release this instructor's invite records, so the account was not removed.",
      },
      { status: 500 },
    );
  }

  // Their own invite row, so the address cannot re-register on its own. Same
  // reasoning as the student delete: an invite with no account behind it is an
  // open door.
  const { error: inviteError } = await admin
    .from("allowed_emails")
    .delete()
    .eq("email", target.email.toLowerCase());
  if (inviteError) {
    console.error("Removing the instructor invite failed:", target.email, inviteError);
    return NextResponse.json(
      { error: "Could not remove their invite, so the account was not removed." },
      { status: 500 },
    );
  }

  // The account itself. Cascades their profile. Any content they created in a
  // class that still exists keeps its rows and loses only its author.
  const { error: deleteError } = await admin.auth.admin.deleteUser(instructorId);
  if (deleteError) {
    console.error("Deleting the instructor account failed:", instructorId, deleteError);
    return NextResponse.json(
      {
        error: `Their invite was removed but the account could not be deleted: ${deleteError.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: `${target.email} has been removed.`,
  });
}
